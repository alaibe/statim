import { invoke } from '@tauri-apps/api/core';

import { appFocused, type MessageNotification } from '@/core/notifications';
import { toHex } from '@/lib/bytes';
import { arrayOf, isNumber, isString, shape } from '@/lib/guards';
import { randomBytes } from '@/lib/random';
import { VaultKey, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';

import { forgetNoteKey, noteKeyInUse, rememberNoteKey, storedNoteKey } from './account-key';
import { changeNotes, signInURL, SignInRequired, type SealedNote } from './cloudkit';
import { icloudContainer, type IcloudSetup } from './container';
import { sealNote, type Note, type NoteKey } from './note';
import type { RelayState } from './relay';

interface Item {
  accountId: string;
  note: Note;
}

interface Saved {
  name: string;
  at: number;
}

const isSavedList = arrayOf(shape<Saved>({ name: isString, at: isNumber }));

/** iCloud copies a note into its push at once, so the record is deleted after this. */
const NOTE_LIFETIME = 5 * 60_000;
const MAX_OPERATIONS = 200;

const HELLO: Note = {
  title: 'Statim',
  body: 'This computer now tells your iPhone about new messages.',
};

let chain: Promise<unknown> = Promise.resolve();
const pending: Item[] = [];
let cleanUp: ReturnType<typeof setTimeout> | undefined;

export async function relayState(accountId: string): Promise<RelayState> {
  if (!icloudContainer()) return 'unavailable';
  if (!(await storedNoteKey(accountId))) return 'off';
  return (await vaultGet(VaultKey.icloudSession)) ? 'on' : 'signed-out';
}

export async function turnOnRelay(accountId: string): Promise<void> {
  const container = icloudContainer();
  if (!container) throw new Error('This build of Statim has no iCloud API token.');
  await rememberNoteKey(accountId);
  const token = (await vaultGet(VaultKey.icloudSession)) ? null : await signIn(container);
  await serial(async () => {
    if (token) await vaultSet(VaultKey.icloudSession, token);
    await deliver([{ accountId, note: HELLO }]);
  }).catch(async (error: unknown) => {
    await turnOffRelay(accountId);
    throw error;
  });
}

export async function turnOffRelay(accountId: string): Promise<void> {
  await forgetNoteKey(accountId);
  if (await noteKeyInUse()) return;
  clearTimeout(cleanUp);
  await serial(() => exchange([], true)).catch(() => {});
  await vaultDelete(VaultKey.icloudSession);
}

/** The iPhone stays quiet while this window has focus, since you are at the computer. */
export function relayToPhone(accountId: string, notification: MessageNotification): void {
  if (!icloudContainer() || appFocused()) return;
  const note = { chat: notification.chatId, title: notification.title, body: notification.body };
  if (pending.push({ accountId, note }) > 1) return;
  serial(() => deliver(pending.splice(0))).catch((error: unknown) =>
    console.warn('[icloud] could not notify the iPhone', error)
  );
}

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => {});
  return run;
}

async function deliver(items: Item[]): Promise<void> {
  const keys = new Map<string, NoteKey | null>();
  const notes: SealedNote[] = [];
  for (const { accountId, note } of items) {
    if (!keys.has(accountId)) keys.set(accountId, await storedNoteKey(accountId));
    const key = keys.get(accountId);
    if (key) {
      notes.push({ name: toHex(randomBytes(16)), tag: key.tag, sealed: sealNote(key.key, note) });
    }
  }
  if (notes.length > 0) await exchange(notes);
}

/** Note names are saved before the request, so a reply lost on the way back cannot leave notes in iCloud for good. */
async function exchange(notes: SealedNote[], all = false): Promise<void> {
  const now = Date.now();
  const saved = [...(await savedNotes()), ...notes.map((note) => ({ name: note.name, at: now }))];
  const discard = saved
    .filter((note) => all || now - note.at >= NOTE_LIFETIME)
    .slice(0, MAX_OPERATIONS - notes.length)
    .map((note) => note.name);
  if (notes.length === 0 && discard.length === 0) return;
  const container = icloudContainer();
  const token = container ? await vaultGet(VaultKey.icloudSession) : null;
  if (!container || !token) return;
  if (notes.length > 0) await vaultSet(VaultKey.icloudNotes, JSON.stringify(saved));
  let changed;
  try {
    changed = await changeNotes(container, token, notes, discard);
  } catch (error) {
    if (error instanceof SignInRequired) await vaultDelete(VaultKey.icloudSession);
    throw error;
  }
  await vaultSet(VaultKey.icloudSession, changed.token);
  const gone = new Set(discard.filter((name) => !changed.undeleted.includes(name)));
  const left = saved.filter((note) => !gone.has(note.name));
  if (gone.size > 0) await vaultSet(VaultKey.icloudNotes, JSON.stringify(left));
  if (left.length > 0 && !all) scheduleCleanUp();
}

async function savedNotes(): Promise<Saved[]> {
  try {
    const parsed: unknown = JSON.parse((await vaultGet(VaultKey.icloudNotes)) ?? '[]');
    return isSavedList(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function scheduleCleanUp(): void {
  clearTimeout(cleanUp);
  cleanUp = setTimeout(() => {
    serial(() => exchange([])).catch((error: unknown) =>
      console.warn('[icloud] could not delete old notes', error)
    );
  }, NOTE_LIFETIME);
}

/** Signs in on Apple's page in the browser, which hands the token back to this computer. */
async function signIn(container: IcloudSetup): Promise<string> {
  const target = await invoke<string>('browser_sign_in', {
    url: await signInURL(container),
    callback: container.callback,
  });
  const token = /[?&]ckWebAuthToken=([^&#]+)/.exec(target)?.[1];
  if (!token) throw new Error('iCloud did not hand back a sign-in.');
  return decodeURIComponent(token);
}

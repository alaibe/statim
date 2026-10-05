import { invoke } from '@tauri-apps/api/core';

import { appFocused, type MessageNotification } from '@/core/notifications';
import { toHex } from '@/lib/bytes';
import { arrayOf, isNumber, isString, shape } from '@/lib/guards';
import { randomBytes } from '@/lib/random';
import { VaultKey, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';

import { forgetNoteKey, noteKeyInUse, rememberNoteKey, storedNoteKey } from './account-key';
import {
  changeNotes,
  signInURL,
  SignInRequired,
  type Container,
  type SealedNote,
} from './cloudkit';
import { ICLOUD_CALLBACK, icloudContainer } from './container';
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

/** iCloud copies a note into its push straight away; after this the record is litter. */
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
  });
}

export async function turnOffRelay(accountId: string): Promise<void> {
  await forgetNoteKey(accountId);
  if (await noteKeyInUse()) return;
  clearTimeout(cleanUp);
  await serial(() => exchange([], true)).catch(() => {});
  await vaultDelete(VaultKey.icloudSession);
}

/** You are at the computer while its window has focus, so the iPhone stays quiet. */
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

/**
 * Each web auth token is good for one request and the reply carries the next,
 * so requests run inside `serial` and the token is replaced after each.
 */
async function spend<T extends { token: string }>(
  request: (container: Container, token: string) => Promise<T>
): Promise<T | null> {
  const container = icloudContainer();
  const token = container ? await vaultGet(VaultKey.icloudSession) : null;
  if (!container || !token) return null;
  try {
    const answer = await request(container, token);
    await vaultSet(VaultKey.icloudSession, answer.token);
    return answer;
  } catch (error) {
    if (error instanceof SignInRequired) await vaultDelete(VaultKey.icloudSession);
    throw error;
  }
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

/** Names are written down before the request, so a reply lost on the way back leaves nothing behind for good. */
async function exchange(notes: SealedNote[], all = false): Promise<void> {
  const now = Date.now();
  const saved = [...(await savedNotes()), ...notes.map((note) => ({ name: note.name, at: now }))];
  const discard = saved
    .filter((note) => all || now - note.at >= NOTE_LIFETIME)
    .slice(0, MAX_OPERATIONS - notes.length)
    .map((note) => note.name);
  if (notes.length === 0 && discard.length === 0) return;
  const changed = await spend(async (container, token) => {
    if (notes.length > 0) await vaultSet(VaultKey.icloudNotes, JSON.stringify(saved));
    return changeNotes(container, token, notes, discard);
  });
  if (!changed) return;
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

/** Apple's own page, in the sign-in window, which stops at the callback so the token never leaves this computer. */
async function signIn(container: Container): Promise<string> {
  await invoke('web_login_open', {
    url: await signInURL(container),
    title: 'Sign in to iCloud',
    userAgent: null,
    script: '',
    hidden: false,
    stopAt: ICLOUD_CALLBACK,
  });
  try {
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const seen = await invoke<{ open: boolean; url: string }>('web_login_poll', {
        readback: 'null',
      });
      if (!seen.open) throw new Error('The iCloud sign-in was closed before it finished.');
      const token = /[?&#]ckWebAuthToken=([^&#]+)/.exec(seen.url)?.[1];
      if (token) return decodeURIComponent(token);
    }
  } finally {
    await invoke('web_login_close').catch(() => {});
  }
}

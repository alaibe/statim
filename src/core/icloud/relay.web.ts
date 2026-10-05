import { invoke } from '@tauri-apps/api/core';

import { loadAccounts } from '@/core/account/accounts';
import { appFocused } from '@/core/notifications';
import { toHex } from '@/lib/bytes';
import { randomBytes } from '@/lib/random';
import { VaultKey, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';

import { forgetNoteKey, rememberNoteKey, storedNoteKey } from './account-key';
import {
  changeNotes,
  currentUser,
  signInURL,
  SignInRequired,
  type Container,
  type SealedNote,
} from './cloudkit';
import { ICLOUD_CALLBACK, icloudContainer } from './container';
import { sealNote, type Note } from './note';
import type { RelayState } from './relay';

interface Item {
  accountId: string;
  note: Note;
}

/** A note this computer saved and has not deleted yet. */
interface Saved {
  name: string;
  at: number;
}

/** iCloud copies a note into its push straight away; after this the record is litter. */
const NOTE_LIFETIME = 5 * 60_000;
const MAX_OPERATIONS = 200;

const HELLO: Note = {
  chat: '',
  title: 'Statim',
  body: 'This computer now tells your iPhone about new messages.',
};

let chain: Promise<unknown> = Promise.resolve();
const pending: Item[] = [];
let scheduled = false;
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
  if (!(await vaultGet(VaultKey.icloudSession))) {
    const token = await signIn(container);
    await vaultSet(VaultKey.icloudSession, await currentUser(container, token));
  }
  await serial(() => deliver([{ accountId, note: HELLO }]));
}

/** The last account to turn it off deletes what is left in iCloud and signs out. */
export async function turnOffRelay(accountId: string): Promise<void> {
  await forgetNoteKey(accountId);
  const keys = await Promise.all(
    (await loadAccounts()).map((account) => storedNoteKey(account.id))
  );
  if (keys.some(Boolean)) return;
  clearTimeout(cleanUp);
  await serial(() => exchange([], true)).catch(() => {});
  await vaultDelete(VaultKey.icloudSession);
}

/** You are at the computer while its window has focus, so the iPhone stays quiet. */
export function relayToPhone(accountId: string, note: Note): void {
  if (appFocused()) return;
  pending.push({ accountId, note });
  if (scheduled) return;
  scheduled = true;
  serial(() => {
    scheduled = false;
    return deliver(pending.splice(0));
  }).catch((error: unknown) => console.warn('[icloud] could not notify the iPhone', error));
}

/** Requests go one at a time, because each spends the token the previous one returned. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => {});
  return run;
}

async function deliver(items: Item[]): Promise<void> {
  const notes: SealedNote[] = [];
  for (const { accountId, note } of items) {
    const key = await storedNoteKey(accountId);
    if (key) {
      notes.push({ name: toHex(randomBytes(16)), tag: key.tag, sealed: sealNote(key.key, note) });
    }
  }
  if (notes.length > 0) await exchange(notes);
}

/**
 * Saves `notes` and, in the same request, deletes the notes old enough to go,
 * or all of them. Names are written down before the request, so a reply lost
 * on the way back leaves nothing behind for good.
 */
async function exchange(notes: SealedNote[], all = false): Promise<void> {
  const container = icloudContainer();
  const token = await vaultGet(VaultKey.icloudSession);
  if (!container || !token) return;
  const now = Date.now();
  const saved: Saved[] = [
    ...JSON.parse((await vaultGet(VaultKey.icloudNotes)) ?? '[]'),
    ...notes.map((note) => ({ name: note.name, at: now })),
  ];
  await vaultSet(VaultKey.icloudNotes, JSON.stringify(saved));
  const discard = saved
    .filter((note) => all || now - note.at >= NOTE_LIFETIME)
    .slice(0, MAX_OPERATIONS - notes.length)
    .map((note) => note.name);
  if (notes.length === 0 && discard.length === 0) return;
  try {
    const changed = await changeNotes(container, token, notes, discard);
    await vaultSet(VaultKey.icloudSession, changed.token);
    const gone = new Set(discard.filter((name) => !changed.undeleted.includes(name)));
    const left = saved.filter((note) => !gone.has(note.name));
    await vaultSet(VaultKey.icloudNotes, JSON.stringify(left));
    if (left.length > 0 && !all) scheduleCleanUp();
  } catch (error) {
    if (error instanceof SignInRequired) await vaultDelete(VaultKey.icloudSession);
    throw error;
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

interface WindowSnapshot {
  open: boolean;
  url: string;
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
      const seen = await invoke<WindowSnapshot>('web_login_poll', { readback: 'null' });
      if (!seen.open) throw new Error('The iCloud sign-in was closed before it finished.');
      const token = /[?&#]ckWebAuthToken=([^&#]+)/.exec(seen.url)?.[1];
      if (token) return decodeURIComponent(token);
    }
  } finally {
    await invoke('web_login_close').catch(() => {});
  }
}

import { readMnemonic } from '@/core/account/key-protection';
import { accountIcloudKeyName, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';

import { noteKey, type NoteKey } from './note';

export async function storedNoteKey(accountId: string): Promise<NoteKey | null> {
  const stored = await vaultGet(accountIcloudKeyName(accountId));
  return stored ? (JSON.parse(stored) as NoteKey) : null;
}

export async function rememberNoteKey(accountId: string): Promise<NoteKey> {
  const phrase = await readMnemonic(accountId, true);
  if (phrase.status === 'denied') throw new Error('Statim could not read the recovery phrase.');
  if (phrase.status !== 'ok') {
    throw new Error('This account has no recovery phrase in Statim to encrypt notifications with.');
  }
  const key = noteKey(phrase.value);
  await vaultSet(accountIcloudKeyName(accountId), JSON.stringify(key));
  return key;
}

export function forgetNoteKey(accountId: string): Promise<void> {
  return vaultDelete(accountIcloudKeyName(accountId));
}

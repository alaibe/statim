import { loadAccounts } from '@/core/account/accounts';
import { readAccountSecret } from '@/core/account/key-protection';
import { isString, shape } from '@/lib/guards';
import { accountIcloudKeyName, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';

import { noteKey, type NoteKey } from './note';

const isNoteKey = shape<NoteKey>({ key: isString, tag: isString });

export async function storedNoteKey(accountId: string): Promise<NoteKey | null> {
  try {
    const parsed: unknown = JSON.parse((await vaultGet(accountIcloudKeyName(accountId))) ?? 'null');
    return isNoteKey(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function rememberNoteKey(accountId: string): Promise<NoteKey> {
  const read = await readAccountSecret(accountId, true);
  if (read.status === 'denied') throw new Error('Statim could not read the account keys.');
  if (read.status !== 'ok') {
    throw new Error(
      'This account has no keys in Statim to encrypt notifications with yet. For a hardware wallet, set up chat keys in Settings › Accounts.'
    );
  }
  const key = noteKey(read.secret);
  await vaultSet(accountIcloudKeyName(accountId), JSON.stringify(key));
  return key;
}

export function forgetNoteKey(accountId: string): Promise<void> {
  return vaultDelete(accountIcloudKeyName(accountId));
}

/** Whether any account on this device still has notifications through iCloud turned on. */
export async function noteKeyInUse(): Promise<boolean> {
  const stored = await Promise.all(
    (await loadAccounts()).map((account) => vaultGet(accountIcloudKeyName(account.id)))
  );
  return stored.some((value) => value !== null);
}

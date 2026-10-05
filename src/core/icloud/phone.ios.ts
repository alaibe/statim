import { loadAccounts } from '@/core/account/accounts';
import { shareWithExtension, unshare } from '@/storage/shared-keychain';

import ICloudNotes from '../../../modules/icloud-notes';
import { forgetNoteKey, rememberNoteKey, storedNoteKey } from './account-key';
import { ICLOUD_CONTAINER } from './container';

/** The notification extension finds a note's key by the tag the note carries. */
function sharedName(tag: string): string {
  return `icloud.${tag}`;
}

export async function hearsFromComputer(accountId: string): Promise<boolean> {
  return (await storedNoteKey(accountId)) !== null;
}

export async function listenToComputer(accountId: string): Promise<void> {
  if (!ICloudNotes) throw new Error('This build of Statim cannot reach iCloud.');
  if ((await ICloudNotes.accountStatus(ICLOUD_CONTAINER)) !== 'available') {
    throw new Error('Sign in to iCloud in the Settings app first.');
  }
  const key = await rememberNoteKey(accountId);
  await shareWithExtension(sharedName(key.tag), JSON.stringify({ key: key.key }));
  await ICloudNotes.subscribe(ICLOUD_CONTAINER);
}

export async function stopListening(accountId: string): Promise<void> {
  const key = await storedNoteKey(accountId);
  if (!key) return;
  await unshare(sharedName(key.tag));
  await forgetNoteKey(accountId);
  const others = await Promise.all(
    (await loadAccounts()).map((account) => storedNoteKey(account.id))
  );
  if (!others.some(Boolean)) await ICloudNotes?.unsubscribe(ICLOUD_CONTAINER);
}

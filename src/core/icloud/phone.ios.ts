import { noteSecretKey, shareWithExtension, unshare } from '@/storage/shared-keychain';

import ICloudNotes from '../../../modules/icloud-notes';
import { forgetNoteKey, noteKeyInUse, rememberNoteKey, storedNoteKey } from './account-key';
import { ICLOUD_CONTAINER, icloudContainer } from './container';
import type { ListeningState } from './phone';

export async function listeningState(accountId: string): Promise<ListeningState> {
  if (!ICloudNotes || !icloudContainer()) return 'unavailable';
  return (await storedNoteKey(accountId)) ? 'on' : 'off';
}

export async function listenToComputer(accountId: string): Promise<void> {
  if (!ICloudNotes) throw new Error('This build of Statim cannot reach iCloud.');
  if (!(await ICloudNotes.available(ICLOUD_CONTAINER))) {
    throw new Error('Sign in to iCloud in the Settings app first.');
  }
  const key = await rememberNoteKey(accountId);
  try {
    await shareWithExtension(noteSecretKey(key.tag), JSON.stringify({ key: key.key }));
    await ICloudNotes.subscribe(ICLOUD_CONTAINER);
  } catch (error) {
    await forget(accountId, key.tag);
    throw error;
  }
}

export async function stopListening(accountId: string): Promise<void> {
  const key = await storedNoteKey(accountId);
  if (!key) return;
  await forget(accountId, key.tag);
  if (!(await noteKeyInUse())) await ICloudNotes?.unsubscribe(ICLOUD_CONTAINER);
}

async function forget(accountId: string, tag: string): Promise<void> {
  await Promise.all([unshare(noteSecretKey(tag)), forgetNoteKey(accountId)]);
}

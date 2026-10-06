import type { MxSession } from '@/protocols/matrix/api';
import { saveSession } from '@/protocols/matrix/descriptor';
import { accountRuntime } from '@/runtime';
import { eraseAccountDirectory } from '@/storage/media';

/** A session signed in elsewhere is a new device, so the store of any earlier one goes. */
export async function adoptMatrixSession(accountId: string, session: MxSession): Promise<void> {
  await eraseAccountDirectory('matrix', accountId);
  await saveSession(accountId, session);
  await accountRuntime.updateProtocolConfig(accountId, 'matrix', {
    homeserver: session.homeserverUrl,
    userId: session.userId,
  });
}

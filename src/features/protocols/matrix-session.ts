import type { MxSession } from '@/protocols/matrix/api';
import { saveSession } from '@/protocols/matrix/descriptor';
import { accountRuntime } from '@/runtime';

export async function adoptMatrixSession(accountId: string, session: MxSession): Promise<void> {
  await saveSession(accountId, session);
  await accountRuntime.updateProtocolConfig(accountId, 'matrix', {
    homeserver: session.homeserverUrl,
    userId: session.userId,
  });
}

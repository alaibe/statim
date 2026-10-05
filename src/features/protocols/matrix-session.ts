import type { HomeserverSession } from '@/core/homeserver';
import { accountRuntime } from '@/runtime';
import { accountMatrixSessionKey, vaultSet } from '@/storage/vault';

/** Keeps a session made outside the Matrix sign-in and points Matrix at its server, which restores it. */
export async function adoptMatrixSession(
  accountId: string,
  session: HomeserverSession
): Promise<void> {
  await vaultSet(accountMatrixSessionKey(accountId), JSON.stringify(session));
  await accountRuntime.updateProtocolConfig(accountId, 'matrix', {
    homeserver: session.homeserverUrl,
    userId: session.userId,
  });
}

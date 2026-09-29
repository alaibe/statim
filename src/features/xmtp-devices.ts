import { useAccountStore } from '@/core/account/account-store';
import { useChatStore, xmtpSessionFor } from '@/core/messaging/chat-store';
import { loadProtocolConfig } from '@/core/messaging/config';
import type { XmtpInstallation } from '@/core/messaging/protocol';
import { protocolById } from '@/protocols';

async function offline() {
  const { activeAccountId, keyring } = useAccountStore.getState();
  const installations = protocolById('xmtp')?.installations;
  if (!activeAccountId || !keyring || !installations) throw new Error('No account is active.');
  const params = {
    account: keyring.account,
    config: await loadProtocolConfig(activeAccountId, 'xmtp'),
  };
  return { installations, params };
}

export async function listXmtpInstallations(): Promise<XmtpInstallation[]> {
  const session = xmtpSessionFor(useChatStore.getState());
  if (session?.listInstallations) return session.listInstallations();
  const { installations, params } = await offline();
  return installations.list(params);
}

export async function revokeXmtpInstallations(ids: string[]): Promise<void> {
  const session = xmtpSessionFor(useChatStore.getState());
  if (session?.revokeInstallations) return session.revokeInstallations(ids);
  const { installations, params } = await offline();
  await installations.revoke(params, ids);
}

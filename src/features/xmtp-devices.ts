import { useAccountStore } from '@/core/account/account-store';
import { useChatStore, xmtpSessionFor } from '@/core/messaging/chat-store';
import type { XmtpInstallation } from '@/protocols/xmtp/adapter';

export type { XmtpInstallation };

function requireAccount() {
  const account = useAccountStore.getState().keyring?.account;
  if (!account) throw new Error('No account is active.');
  return account;
}

/** Only a connected session knows which installation is this one; without it none is. */
export async function listXmtpInstallations(): Promise<XmtpInstallation[]> {
  const session = xmtpSessionFor(useChatStore.getState());
  if (session?.listInstallations) return session.listInstallations();
  const { inboxInstallations } = await import('@/protocols/xmtp/adapter');
  return inboxInstallations(requireAccount());
}

export async function revokeXmtpInstallations(ids: string[]): Promise<void> {
  const { revokeInboxInstallations } = await import('@/protocols/xmtp/adapter');
  await revokeInboxInstallations(requireAccount(), ids);
}

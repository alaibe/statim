import { activeAccount, useAccountStore } from '@/core/account/account-store';
import { useLockStore } from '@/core/account/lock-store';
import { useChatStore } from '@/core/messaging/chat-store';
import { openChat } from '@/features/navigation/open';

import { readyChat, whenSettled, type CliHandler } from '../context';

export const appHandlers = {
  async status() {
    await whenSettled();
    const lock = useLockStore.getState().status;
    const accountState = useAccountStore.getState();
    const account = activeAccount(accountState);
    const protocols = Object.fromEntries(
      Object.entries(useChatStore.getState().protocols).map(([id, p]) => [
        id,
        { status: p.status, error: p.error ?? undefined, waitingFor: p.login?.step },
      ])
    );
    const data = {
      locked: lock === 'locked',
      accountStatus: accountState.status,
      account: account ? { id: account.id, label: account.label, address: account.address } : null,
      protocols,
    };
    return {
      data,
      text: [
        lock === 'locked' ? 'Locked' : 'Unlocked',
        account
          ? `Account: ${account.label} (${account.address})`
          : `Account: none (${accountState.status})`,
        ...Object.entries(protocols).map(
          ([id, n]) =>
            `  ${id}: ${n.status}${n.waitingFor ? ` (waiting for ${n.waitingFor})` : ''}${n.error ? ` — ${n.error}` : ''}`
        ),
      ],
    };
  },

  async open({ args }, { io }) {
    await io.showWindow();
    if (!args.chat) return { data: { opened: true }, text: 'Opened.' };
    const chat = await readyChat(args.chat);
    openChat(chat.id);
    return { data: { opened: true, chat: chat.id }, text: `Opened ${chat.label}.` };
  },
} satisfies Record<string, CliHandler>;

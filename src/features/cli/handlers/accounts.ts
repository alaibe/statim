import { router } from 'expo-router';

import { eraseAccount, eraseAllAccounts } from '@/core/app/erase-account';
import { activeAccount, useAccountStore } from '@/core/account/account-store';
import { createMnemonic } from '@/core/account/keyring';
import { useChatStore } from '@/core/messaging/chat-store';

import {
  approveOrThrow,
  findAccount,
  whenAccountReady,
  whenUnlocked,
  type CliHandler,
} from '../context';
import { CliError } from '../errors';
import { readText } from './input';

export const accountHandlers = {
  async accounts() {
    await whenUnlocked();
    const { accounts, activeAccountId } = useAccountStore.getState();
    const data = accounts.map((a) => ({
      id: a.id,
      label: a.label,
      address: a.address,
      kind: a.kind,
      active: a.id === activeAccountId,
    }));
    return {
      data,
      text: data.length
        ? data.map((a) => `${a.active ? '*' : ' '} ${a.label}  ${a.address}  ${a.kind}  ${a.id}`)
        : 'No accounts yet. Run statim accounts create, or accounts import.',
    };
  },

  async 'accounts use'({ args }) {
    await whenUnlocked();
    const account = findAccount(args.account!);
    await useAccountStore.getState().selectAccount(account.id);
    await whenAccountReady();
    return { data: { id: account.id }, text: `Now using ${account.label}.` };
  },

  async 'accounts rename'({ args }) {
    await whenUnlocked();
    const account = findAccount(args.account!);
    await useAccountStore.getState().renameAccount(account.id, args.label!);
    return { data: { id: account.id, label: args.label }, text: `Renamed to ${args.label}.` };
  },

  async 'accounts create'({ flags }) {
    await whenUnlocked();
    await useAccountStore.getState().adoptAccount(createMnemonic(), label(flags.label));
    const account = activeAccount(useAccountStore.getState())!;
    return {
      data: { id: account.id, label: account.label, address: account.address },
      text: [
        `Created ${account.label} (${account.address}).`,
        'Write down its recovery phrase in the app: Settings › Recovery phrase. The command line never shows it.',
      ],
    };
  },

  async 'accounts import'({ flags }, { io }) {
    await whenUnlocked();
    const phrase = await readText(io, 'Recovery phrase: ', true);
    if (!phrase.trim()) throw new CliError('No recovery phrase given.', 'usage');
    await useAccountStore.getState().adoptAccount(phrase, label(flags.label));
    const account = activeAccount(useAccountStore.getState())!;
    return {
      data: { id: account.id, label: account.label, address: account.address },
      text: `Imported ${account.label} (${account.address}).`,
    };
  },

  async 'accounts erase'({ args, flags }, { io }) {
    await whenUnlocked();
    if (Boolean(flags.all) === Boolean(args.account)) {
      throw new CliError('Name one account, or pass --all.', 'usage');
    }
    const accounts = flags.all ? useAccountStore.getState().accounts : [findAccount(args.account!)];
    if (!accounts.length) throw new CliError('There are no accounts to erase.', 'notFound');
    await approveOrThrow(
      io,
      `Erase ${accounts.map((a) => `${a.label} (${a.address})`).join(', ')} from this device?\nWithout its recovery phrase an account cannot be restored.`
    );
    if (flags.all) await eraseAllAccounts();
    else await eraseAccount(accounts[0].id);
    router.replace(useAccountStore.getState().accounts.length ? '/chats' : '/(onboarding)/welcome');
    return {
      data: { erased: accounts.map((a) => a.id) },
      text: `Erased ${accounts.map((a) => a.label).join(', ')}.`,
    };
  },

  async whoami() {
    await whenAccountReady();
    const account = activeAccount(useAccountStore.getState())!;
    const protocols = Object.entries(useChatStore.getState().sessions).map(([id, session]) => ({
      protocol: id,
      id: session.self.participantId,
      address: session.self.address,
    }));
    return {
      data: { id: account.id, label: account.label, address: account.address, protocols },
      text: [
        `${account.label}  ${account.address}`,
        ...protocols.map(
          (n) =>
            `  ${n.protocol}: ${n.id}${n.address && n.address !== n.id ? ` (${n.address})` : ''}`
        ),
      ],
    };
  },
} satisfies Record<string, CliHandler>;

function label(value: string | true | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

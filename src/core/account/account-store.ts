import { stringToBytes, type Address, type Hex } from 'viem';
import { create } from 'zustand';

import {
  addressForMnemonic,
  createAccountId,
  loadAccounts,
  loadActiveAccountId,
  saveAccounts,
  setActiveAccountId,
  forgetAccount,
  type AccountRecord,
} from './accounts';
import { CHAT_KEY_MESSAGE, chatSeedFrom, hardwareKeyring } from './chat-seed';
import { deviceSigner, holdDevice, keyOf, releaseDevice } from './device-session';
import { hardwareAccount, type HardwareSigner } from './hardware';
import { deleteMnemonic, readMnemonic, writeMnemonic } from './key-protection';
import {
  isValidMnemonic,
  keyringFromMnemonic,
  normalizeMnemonic,
  persistAccountMnemonic,
  type Keyring,
} from './keyring';
import { errorMessage } from '../errors';

export type AccountStatus = 'loading' | 'absent' | 'ready' | 'blocked' | 'invalidated' | 'error';

export interface AccountState {
  status: AccountStatus;
  accounts: AccountRecord[];
  activeAccountId: string | null;
  keyring: Keyring | null;
  /** False for a hardware account whose wallet has not signed the chat key message here yet. */
  chatKeys: boolean;
  error: string | null;

  restore(): Promise<void>;
  retryUnlock(): Promise<boolean>;
  adoptAccount(phrase: string, label?: string): Promise<void>;
  addHardwareAccount(params: HardwareAccountParams): Promise<void>;
  setUpChatKeys(): Promise<void>;
  selectAccount(id: string): Promise<void>;
  renameAccount(id: string, label: string): Promise<void>;
  removeErasedAccount(id: string): Promise<void>;
}

export interface HardwareAccountParams {
  address: Address;
  vendorId: string;
  label: string;
  path: string;
  device?: string;
  xfp?: string;
  /** The wallet just used, kept open for what the account does next. */
  signer: HardwareSigner;
}

async function signChatKeys(signer: HardwareSigner, path: string): Promise<Hex> {
  return chatSeedFrom(await signer.signMessage(path, stringToBytes(CHAT_KEY_MESSAGE)));
}

export function activeAccount(
  state: Pick<AccountState, 'accounts' | 'activeAccountId'>
): AccountRecord | undefined {
  return state.accounts.find((a) => a.id === state.activeAccountId);
}

let restoring = false;

export const useAccountStore = create<AccountState>((set, get) => ({
  status: 'loading',
  accounts: [],
  activeAccountId: null,
  keyring: null,
  chatKeys: true,
  error: null,

  async restore() {
    if (restoring) return;
    restoring = true;

    try {
      const [accounts, storedId] = await Promise.all([loadAccounts(), loadActiveAccountId()]);
      if (accounts.length === 0) {
        set({ status: 'absent', accounts: [], activeAccountId: null, keyring: null, error: null });
        return;
      }

      const active = accounts.find((a) => a.id === storedId) ?? accounts[0];
      if (active.id !== storedId) await setActiveAccountId(active.id);

      set({ accounts, error: null });
      await activate(active.id, set);
    } catch (error) {
      set({ status: 'error', error: errorMessage(error) });
    } finally {
      restoring = false;
    }
  },

  async retryUnlock() {
    const id = get().activeAccountId;
    if (!id) return false;
    if (restoring) return false;

    restoring = true;
    try {
      return (await activate(id, set)) === 'ready';
    } finally {
      restoring = false;
    }
  },

  async adoptAccount(phrase: string, label?: string) {
    const normalized = normalizeMnemonic(phrase);
    if (!isValidMnemonic(normalized)) {
      throw new Error('That recovery phrase is not valid. Check the spelling and word order.');
    }

    const address = addressForMnemonic(normalized);
    const existing = get().accounts;

    const duplicate = existing.find((a) => a.address.toLowerCase() === address.toLowerCase());
    if (duplicate) {
      await deleteMnemonic(duplicate.id);
      await persistAccountMnemonic(duplicate.id, normalized);
      await setActiveAccountId(duplicate.id);
      set({ accounts: existing });
      await activate(duplicate.id, set);
      return;
    }

    const id = createAccountId();
    await persistAccountMnemonic(id, normalized);

    const record: AccountRecord = {
      id,
      label: label?.trim() || `Account ${existing.length + 1}`,
      address,
      createdAt: Date.now(),
      kind: 'phrase',
    };
    const accounts = [...existing, record];
    await saveAccounts(accounts);
    await setActiveAccountId(id);

    set({ accounts });
    await activate(id, set);
  },

  async addHardwareAccount({ signer, ...params }: HardwareAccountParams) {
    const existing = get().accounts;
    const duplicate = existing.find(
      (a) => a.address.toLowerCase() === params.address.toLowerCase()
    );
    if (duplicate?.kind === 'phrase') {
      throw new Error(
        `This wallet's account is already here as ${duplicate.label}, with its recovery phrase.`
      );
    }
    const seed = await signChatKeys(signer, params.path);
    const fields = {
      address: params.address,
      kind: 'hardware' as const,
      vendorId: params.vendorId,
      path: params.path,
      device: params.device,
      xfp: params.xfp,
    };

    const record: AccountRecord = duplicate
      ? { ...duplicate, ...fields }
      : {
          id: createAccountId(),
          label: params.label,
          createdAt: Date.now(),
          ...fields,
        };
    const accounts = duplicate
      ? existing.map((a) => (a.id === record.id ? record : a))
      : [...existing, record];

    if (duplicate) await deleteMnemonic(record.id);
    await writeMnemonic(record.id, seed);
    await saveAccounts(accounts);
    await setActiveAccountId(record.id);
    holdDevice(record.id, signer);
    set({ accounts });
    await activate(record.id, set, seed);
  },

  async setUpChatKeys() {
    const record = activeAccount(get());
    if (record?.kind !== 'hardware') return;
    const seed = await signChatKeys(deviceSigner(record), keyOf(record).path);
    await writeMnemonic(record.id, seed);
    await activate(record.id, set, seed);
  },

  async selectAccount(id: string) {
    if (get().activeAccountId === id) return;
    if (!get().accounts.some((a) => a.id === id)) return;

    await setActiveAccountId(id);
    await activate(id, set);
  },

  async renameAccount(id: string, label: string) {
    const trimmed = label.trim();
    if (!trimmed) return;

    const accounts = get().accounts.map((a) => (a.id === id ? { ...a, label: trimmed } : a));
    await saveAccounts(accounts);
    set({ accounts });
  },

  async removeErasedAccount(id: string) {
    releaseDevice(id);
    const remaining = await forgetAccount(id);

    if (remaining.length === 0) {
      set({ status: 'absent', accounts: [], activeAccountId: null, keyring: null });
      return;
    }

    set({ accounts: remaining });
    if (get().activeAccountId === id) {
      await activate(remaining[0].id, set);
    }
  },
}));

/** `secret` is what was just written to the account's slot, so it need not be read back. */
async function activate(
  accountId: string,
  set: (partial: Partial<AccountStateSlice>) => void,
  secret?: string
): Promise<'ready' | 'blocked' | 'invalidated'> {
  const record = useAccountStore.getState().accounts.find((a) => a.id === accountId);
  const result =
    secret === undefined
      ? await readMnemonic(accountId, true)
      : ({ status: 'ok', value: secret } as const);

  if (record?.kind === 'hardware') {
    if (result.status === 'denied') {
      set({ status: 'blocked', activeAccountId: accountId, keyring: null, error: null });
      return 'blocked';
    }
    const seed = result.status === 'ok' ? (result.value as Hex) : null;
    const key = keyOf(record);
    set({
      status: 'ready',
      activeAccountId: accountId,
      keyring: hardwareKeyring(hardwareAccount(deviceSigner(record), key.address, key.path), seed),
      chatKeys: seed !== null,
      error: null,
    });
    return 'ready';
  }

  if (result.status !== 'ok') {
    const status = result.status === 'denied' ? 'blocked' : 'invalidated';
    set({ status, activeAccountId: accountId, keyring: null, error: null });
    return status;
  }

  set({
    status: 'ready',
    activeAccountId: accountId,
    keyring: keyringFromMnemonic(result.value),
    chatKeys: true,
    error: null,
  });
  return 'ready';
}

type AccountStateSlice = Pick<
  AccountState,
  'status' | 'accounts' | 'activeAccountId' | 'keyring' | 'chatKeys' | 'error'
>;

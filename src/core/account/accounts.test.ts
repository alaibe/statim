import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { loadAccounts, loadActiveAccountId } from './accounts';
import { eraseAccount, eraseEverything } from '../app/erase-account';
import { useAccountStore } from './account-store';
import { scopePrefix } from '@/storage/scope';
import { accountMnemonicKey, VaultKey } from '@/storage/vault';

/** Two valid BIP-39 phrases, so "same device, two accounts" is real. */
const PHRASE_A = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const PHRASE_B = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

beforeEach(async () => {
  (SecureStore as unknown as { __reset(): void }).__reset();
  await AsyncStorage.clear();
  useAccountStore.setState({
    status: 'loading',
    accounts: [],
    activeAccountId: null,
    keyring: null,
    error: null,
  });
});

describe('multiple accounts', () => {
  it('keeps both when a second is added', async () => {
    const store = useAccountStore.getState();
    await store.adoptAccount(PHRASE_A);
    await store.adoptAccount(PHRASE_B);

    const { accounts, activeAccountId } = useAccountStore.getState();
    expect(accounts).toHaveLength(2);
    // Adding an account switches to it.
    expect(activeAccountId).toBe(accounts[1].id);
  });

  it('gives each account its own keys', async () => {
    const store = useAccountStore.getState();
    await store.adoptAccount(PHRASE_A);
    await store.adoptAccount(PHRASE_B);

    const [a, b] = useAccountStore.getState().accounts;
    expect(a.address).not.toBe(b.address);
    expect(await SecureStore.getItemAsync(accountMnemonicKey(a.id))).not.toBe(
      await SecureStore.getItemAsync(accountMnemonicKey(b.id))
    );
  });

  it('switches to an existing account rather than importing it twice', async () => {
    const store = useAccountStore.getState();
    await store.adoptAccount(PHRASE_A);
    await store.adoptAccount(PHRASE_B);

    await useAccountStore.getState().adoptAccount(PHRASE_A);

    const { accounts, activeAccountId } = useAccountStore.getState();
    expect(accounts).toHaveLength(2);
    expect(activeAccountId).toBe(accounts[0].id);
  });

  it('points the storage scope at whichever account is active', async () => {
    const store = useAccountStore.getState();
    await store.adoptAccount(PHRASE_A);
    const first = useAccountStore.getState().accounts[0];

    await useAccountStore.getState().adoptAccount(PHRASE_B);
    const second = useAccountStore.getState().accounts[1];
    await AsyncStorage.setItem(scopePrefix(second.id) + 'chat.readAt', '{"x":1}');

    await useAccountStore.getState().selectAccount(first.id);

    // The second account's data is untouched but out of scope.
    expect(await AsyncStorage.getItem(scopePrefix(second.id) + 'chat.readAt')).toBe('{"x":1}');
    expect(useAccountStore.getState().activeAccountId).toBe(first.id);
  });
});

describe('eraseAccount', () => {
  it('does not remove an inactive account or its keys when storage erase fails', async () => {
    const store = useAccountStore.getState();
    await store.adoptAccount(PHRASE_A);
    await store.adoptAccount(PHRASE_B);
    const [inactive] = useAccountStore.getState().accounts;
    await AsyncStorage.setItem(scopePrefix(inactive.id) + 'chat.readAt', '{}');
    jest.spyOn(AsyncStorage, 'multiRemove').mockRejectedValueOnce(new Error('storage busy'));

    await expect(eraseAccount(inactive.id)).rejects.toThrow('async-storage');

    expect(useAccountStore.getState().accounts.map((account) => account.id)).toContain(inactive.id);
    expect(await SecureStore.getItemAsync(accountMnemonicKey(inactive.id))).not.toBeNull();
  });

  it('keeps the account index and keys when full-wipe data removal fails', async () => {
    const store = useAccountStore.getState();
    await store.adoptAccount(PHRASE_A);
    const [account] = useAccountStore.getState().accounts;
    await AsyncStorage.setItem(scopePrefix(account.id) + 'chat.readAt', '{}');
    jest.spyOn(AsyncStorage, 'multiRemove').mockRejectedValueOnce(new Error('storage busy'));

    await expect(eraseEverything()).rejects.toThrow('async-storage');

    expect((await loadAccounts()).map((entry) => entry.id)).toEqual([account.id]);
    expect(await SecureStore.getItemAsync(accountMnemonicKey(account.id))).not.toBeNull();
  });

  it('destroys only the target account', async () => {
    const store = useAccountStore.getState();
    await store.adoptAccount(PHRASE_A);
    await store.adoptAccount(PHRASE_B);
    const [a, b] = useAccountStore.getState().accounts;

    await eraseAccount(a.id);

    expect(await SecureStore.getItemAsync(accountMnemonicKey(a.id))).toBeNull();
    expect(await SecureStore.getItemAsync(accountMnemonicKey(b.id))).not.toBeNull();
    expect((await loadAccounts()).map((x) => x.id)).toEqual([b.id]);
  });

  it('hands the active slot to a survivor', async () => {
    const store = useAccountStore.getState();
    await store.adoptAccount(PHRASE_A);
    await store.adoptAccount(PHRASE_B);
    const [a, b] = useAccountStore.getState().accounts;

    await useAccountStore.getState().selectAccount(a.id);
    await eraseAccount(a.id);

    expect(await loadActiveAccountId()).toBe(b.id);
  });

  it('removes the account through the store, clearing its scoped data', async () => {
    const store = useAccountStore.getState();
    await store.adoptAccount(PHRASE_A);
    await store.adoptAccount(PHRASE_B);
    const [a, b] = useAccountStore.getState().accounts;

    await AsyncStorage.setItem(scopePrefix(a.id) + 'chat.readAt', '{}');
    await AsyncStorage.setItem(scopePrefix(b.id) + 'chat.readAt', '{"keep":1}');

    await eraseAccount(a.id);

    expect(await AsyncStorage.getItem(scopePrefix(a.id) + 'chat.readAt')).toBeNull();
    expect(await AsyncStorage.getItem(scopePrefix(b.id) + 'chat.readAt')).toBe('{"keep":1}');
  });

  it('returns to onboarding when the last account goes', async () => {
    await useAccountStore.getState().adoptAccount(PHRASE_A);
    const [only] = useAccountStore.getState().accounts;

    await eraseAccount(only.id);

    expect(useAccountStore.getState().status).toBe('absent');
    expect(useAccountStore.getState().keyring).toBeNull();
  });
});

describe('restore', () => {
  it('falls back to a surviving account when the stored active id is stale', async () => {
    const store = useAccountStore.getState();
    await store.adoptAccount(PHRASE_A);
    const [a] = useAccountStore.getState().accounts;

    await SecureStore.setItemAsync(VaultKey.activeAccountId, 'no-such-account');
    await useAccountStore.getState().restore();

    expect(useAccountStore.getState().activeAccountId).toBe(a.id);
    expect(useAccountStore.getState().status).toBe('ready');
  });
});

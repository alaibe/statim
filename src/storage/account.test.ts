import AsyncStorage from '@react-native-async-storage/async-storage';

import { createAccountStorage } from './account';
import { deleteAccountDatabase } from './database';
import { scopePrefix } from './scope';

const ACCOUNTS = ['one', 'two'];

beforeEach(async () => {
  await AsyncStorage.clear();
  for (const id of ACCOUNTS) await deleteAccountDatabase(id);
});

describe('account storage', () => {
  it('keeps values in the account database', async () => {
    await createAccountStorage('one').set('chat.prefs', { a: { pinned: true } });

    expect(await createAccountStorage('one').get('chat.prefs')).toEqual({ a: { pinned: true } });
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it('gives each account its own values', async () => {
    await createAccountStorage('one').set('chat.prefs', { a: {} });

    expect(await createAccountStorage('two').get('chat.prefs')).toBeNull();
  });

  it('binds plugin reads and writes to their owning account', async () => {
    const a = createAccountStorage('one').plugin('wallet');
    const b = createAccountStorage('two').plugin('wallet');
    await a.set('chain', 'mainnet');

    expect(await a.get('chain')).toBe('mainnet');
    expect(await b.get('chain')).toBeNull();
  });

  it('forgets a value set to null', async () => {
    const storage = createAccountStorage('one');
    await storage.set('appearance', { theme: 'dark' });
    await storage.set('appearance', null);

    expect(await storage.get('appearance')).toBeNull();
  });
});

describe('values left in AsyncStorage', () => {
  it('move into the database and leave AsyncStorage', async () => {
    await AsyncStorage.setItem(`${scopePrefix('one')}chat.readAt`, '{"c":5}');
    await AsyncStorage.setItem(`${scopePrefix('two')}chat.readAt`, '{"c":9}');

    expect(await createAccountStorage('one').get('chat.readAt')).toEqual({ c: 5 });
    expect(await AsyncStorage.getAllKeys()).toEqual([`${scopePrefix('two')}chat.readAt`]);
  });

  it('do not replace what the database already holds', async () => {
    await createAccountStorage('one').set('chat.readAt', { c: 1 });
    await AsyncStorage.setItem(`${scopePrefix('one')}chat.readAt`, '{"c":5}');
    await AsyncStorage.setItem(`${scopePrefix('one')}chat.prefs`, '{"c":{"muted":true}}');

    const storage = createAccountStorage('one');
    expect(await storage.get('chat.readAt')).toEqual({ c: 1 });
    expect(await storage.get('chat.prefs')).toEqual({ c: { muted: true } });
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it('are dropped when unreadable', async () => {
    await AsyncStorage.setItem(`${scopePrefix('one')}chat.prefs`, 'not json');

    expect(await createAccountStorage('one').get('chat.prefs')).toBeNull();
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });
});

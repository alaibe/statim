import { createAccountStorage } from './account';
import { deleteAccountDatabase } from './database';

const ACCOUNTS = ['one', 'two'];

beforeEach(async () => {
  for (const id of ACCOUNTS) await deleteAccountDatabase(id);
});

describe('account storage', () => {
  it('keeps values in the account database', async () => {
    await createAccountStorage('one').set('chat.prefs', { a: { pinned: true } });

    expect(await createAccountStorage('one').get('chat.prefs')).toEqual({ a: { pinned: true } });
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

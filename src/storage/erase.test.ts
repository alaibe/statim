import { createAccountStorage } from './account';
import { eraseAccountStorage } from './erase';
import * as engine from './sqlite-engine';
import { accountMnemonicKey, vaultGet, vaultSet } from './vault';

describe('the erase path', () => {
  it('keeps account keys when another medium fails and succeeds on retry', async () => {
    const accountId = 'retry-account';
    await createAccountStorage(accountId).set('chat.readAt', {});
    await vaultSet(accountMnemonicKey(accountId), 'secret');
    jest.spyOn(engine, 'deleteDatabase').mockRejectedValueOnce(new Error('disk busy'));

    await expect(eraseAccountStorage(accountId)).rejects.toThrow('database');
    expect(await vaultGet(accountMnemonicKey(accountId))).toBe('secret');

    await expect(eraseAccountStorage(accountId)).resolves.toBeDefined();
    expect(await createAccountStorage(accountId).get('chat.readAt')).toBeNull();
    expect(await vaultGet(accountMnemonicKey(accountId))).toBeNull();
  });
});

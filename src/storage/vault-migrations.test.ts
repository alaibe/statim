import * as SecureStore from 'expo-secure-store';

import { migrateVault, VaultKey, vaultGet } from './vault';
import { VAULT_MIGRATIONS, type VaultStep } from './vault-migrations';

const keychain = SecureStore as unknown as { __reset(): void };

beforeEach(() => keychain.__reset());

const version = () => SecureStore.getItemAsync(VaultKey.version);
const withAccounts = () => SecureStore.setItemAsync(VaultKey.accountIndex, '[]');

function step(log: string[], name: string): VaultStep {
  return async (vault) => {
    log.push(name);
    await vault.set(`seen.${name}`, 'yes');
  };
}

it('runs each step the vault has not had, once and in order', async () => {
  await withAccounts();
  const log: string[] = [];
  const steps = [step(log, 'one'), step(log, 'two')];

  await migrateVault(steps);
  await migrateVault(steps);

  expect(log).toEqual(['one', 'two']);
  expect(await version()).toBe('2');
  expect(await SecureStore.getItemAsync('seen.two')).toBe('yes');
});

it('gives a vault with no accounts the current version without running anything', async () => {
  const log: string[] = [];

  await migrateVault([step(log, 'one')]);

  expect(log).toEqual([]);
  expect(await version()).toBe('1');
});

it('resumes at the step that failed', async () => {
  await withAccounts();
  const log: string[] = [];
  let locked = true;
  const flaky: VaultStep = async () => {
    if (locked) throw new Error('keychain locked');
    log.push('two');
  };
  const steps = [step(log, 'one'), flaky, step(log, 'three')];

  await expect(migrateVault(steps)).rejects.toThrow('keychain locked');
  expect(await version()).toBe('1');

  locked = false;
  await migrateVault(steps);

  expect(log).toEqual(['one', 'two', 'three']);
  expect(await version()).toBe('3');
});

it('migrates before the first read', async () => {
  await vaultGet(VaultKey.accountIndex);

  expect(await version()).toBe(String(VAULT_MIGRATIONS.length));
});

import * as Crypto from 'expo-crypto';

import { toHex } from '@/lib/bytes';

import * as store from './secure-store';
import { VAULT_MIGRATIONS, type VaultStep } from './vault-migrations';

export const VaultKey = {
  accountIndex: 'accounts.index',
  activeAccountId: 'accounts.active',
  biometricLock: 'security.biometricLock',
  commandLine: 'security.commandLine',
  keyProtection: 'security.keyProtection',
  pin: 'security.pin',
  pinAttempts: 'security.pinAttempts',
  version: 'vault.version',
} as const;

export type VaultKeyName = (typeof VaultKey)[keyof typeof VaultKey] | AccountScopedKey;

type AccountScopedKey = `account.${string}.${
  | 'mnemonic'
  | 'dbKey'
  | 'appDbKey'
  | 'tdlibDbKey'
  | 'matrixStoreKey'
  | 'matrixSession'
  | 'protocols'
  | 'credentials'}`;

export function accountMnemonicKey(accountId: string): AccountScopedKey {
  return `account.${accountId}.mnemonic`;
}

export function accountDbKeyName(accountId: string): AccountScopedKey {
  return `account.${accountId}.dbKey`;
}

// The app database and XMTP database must not share key material.
export function accountAppDbKeyName(accountId: string): AccountScopedKey {
  return `account.${accountId}.appDbKey`;
}

// Telegram's TDLib database has its own key, kept apart from the XMTP one.
export function accountTdlibDbKeyName(accountId: string): AccountScopedKey {
  return `account.${accountId}.tdlibDbKey`;
}

// Matrix's SDK store has its own passphrase; the session (access token) sits beside it.
export function accountMatrixStoreKeyName(accountId: string): AccountScopedKey {
  return `account.${accountId}.matrixStoreKey`;
}

export function accountMatrixSessionKey(accountId: string): AccountScopedKey {
  return `account.${accountId}.matrixSession`;
}

export function accountProtocolConfigsKey(accountId: string): AccountScopedKey {
  return `account.${accountId}.protocols`;
}

export function accountCredentialsKey(accountId: string): AccountScopedKey {
  return `account.${accountId}.credentials`;
}

export function accountScopedKeys(accountId: string): VaultKeyName[] {
  return [
    accountMnemonicKey(accountId),
    accountDbKeyName(accountId),
    accountAppDbKeyName(accountId),
    accountTdlibDbKeyName(accountId),
    accountMatrixStoreKeyName(accountId),
    accountMatrixSessionKey(accountId),
    accountProtocolConfigsKey(accountId),
    accountCredentialsKey(accountId),
  ];
}

export { isSecureStorageAvailable } from './secure-store';

export type ProtectedRead =
  | { status: 'ok'; value: string }
  | { status: 'absent' }
  | { status: 'invalidated' }
  | { status: 'denied' };

/**
 * Runs the steps this vault has not had yet. A vault with no version and no
 * accounts is new, or was wiped, and already holds the current formats.
 */
export async function migrateVault(steps: readonly VaultStep[] = VAULT_MIGRATIONS): Promise<void> {
  const stored = await store.get(VaultKey.version);
  let done = Number(stored);
  if (stored === null) {
    done = (await store.get(VaultKey.accountIndex)) === null ? steps.length : 0;
    await store.set(VaultKey.version, String(done));
  }
  for (; done < steps.length; done += 1) {
    await steps[done](store);
    await store.set(VaultKey.version, String(done + 1));
  }
}

let migrated: Promise<void> | undefined;

/** Every read and write waits for the migration, whichever reaches the vault first. */
function migratedVault(): Promise<void> {
  migrated ??= migrateVault().catch((error) => {
    migrated = undefined;
    throw error;
  });
  return migrated;
}

export async function vaultGetProtected(
  key: VaultKeyName,
  prompt: string,
  expectExisting: boolean
): Promise<ProtectedRead> {
  await migratedVault();
  try {
    const value = await store.getProtected(key, prompt);
    if (value !== null) return { status: 'ok', value };
    return expectExisting ? { status: 'invalidated' } : { status: 'absent' };
  } catch {
    return { status: 'denied' };
  }
}

export async function vaultSetProtected(key: VaultKeyName, value: string): Promise<void> {
  await migratedVault();
  return store.setProtected(key, value, 'Confirm to save your keys');
}

export async function vaultDeleteProtected(key: VaultKeyName): Promise<void> {
  await migratedVault();
  return store.removeProtected(key);
}

export async function vaultGet(key: VaultKeyName): Promise<string | null> {
  await migratedVault();
  return store.get(key);
}

export async function vaultSet(key: VaultKeyName, value: string): Promise<void> {
  await migratedVault();
  return store.set(key, value);
}

export async function vaultDelete(key: VaultKeyName): Promise<void> {
  await migratedVault();
  return store.remove(key);
}

/** A random secret under `name`, created on first use. */
async function accountSecret(name: AccountScopedKey, fresh: () => string): Promise<string> {
  const existing = await vaultGet(name);
  if (existing) return existing;

  const value = fresh();
  await vaultSet(name, value);
  return value;
}

const randomHex = () => toHex(Crypto.getRandomBytes(32));

export function accountDatabaseKey(accountId: string): Promise<string> {
  return accountSecret(accountAppDbKeyName(accountId), randomHex);
}

/** Base64, which is how TDLib's JSON interface takes bytes. */
export function accountTdlibDatabaseKey(accountId: string): Promise<string> {
  return accountSecret(accountTdlibDbKeyName(accountId), () =>
    globalThis.btoa(String.fromCharCode(...Crypto.getRandomBytes(32)))
  );
}

export function accountMatrixStoreKey(accountId: string): Promise<string> {
  return accountSecret(accountMatrixStoreKeyName(accountId), randomHex);
}

export async function vaultWipe(accountIds: string[] = []): Promise<void> {
  const accountKeys = accountIds.flatMap((id) => accountScopedKeys(id));
  await Promise.all(accountKeys.map((key) => vaultDelete(key)));
  await Promise.all(accountIds.map((id) => vaultDeleteProtected(accountMnemonicKey(id))));

  const deviceKeys = Object.values(VaultKey).filter((key) => key !== VaultKey.accountIndex);
  await Promise.all(deviceKeys.map((key) => vaultDelete(key)));
  await vaultDelete(VaultKey.accountIndex);
}

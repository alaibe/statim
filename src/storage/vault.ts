import * as Crypto from "expo-crypto";

import { bytesToBase64, toHex } from "@/lib/bytes";

import * as store from "./secure-store";

export const VaultKey = {
  accountIndex: "accounts.index",
  activeAccountId: "accounts.active",
  biometricLock: "security.biometricLock",
  commandLine: "security.commandLine",
  keyProtection: "security.keyProtection",
  icloudSession: "notifications.icloudSession",
  pin: "security.pin",
  pinAttempts: "security.pinAttempts",
  usageStore: "usage.store",
} as const;

type VaultKeyName = (typeof VaultKey)[keyof typeof VaultKey] | AccountScopedKey;

type AccountScopedKey = `account.${string}.${
  | "mnemonic"
  | "dbKey"
  | "appDbKey"
  | "tdlibDbKey"
  | "matrixStoreKey"
  | "matrixSession"
  | "protocols"
  | "credentials"
  | "ai"
  | "icloudKey"}`;

export function accountMnemonicKey(accountId: string): AccountScopedKey {
  return `account.${accountId}.mnemonic`;
}

// Each database has a key of its own; no two share key material.
export function accountDbKeyName(accountId: string): AccountScopedKey {
  return `account.${accountId}.dbKey`;
}

function accountAppDbKeyName(accountId: string): AccountScopedKey {
  return `account.${accountId}.appDbKey`;
}

function accountTdlibDbKeyName(accountId: string): AccountScopedKey {
  return `account.${accountId}.tdlibDbKey`;
}

function accountMatrixStoreKeyName(accountId: string): AccountScopedKey {
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

export function accountAiConfigKey(accountId: string): AccountScopedKey {
  return `account.${accountId}.ai`;
}

export function accountIcloudKeyName(accountId: string): AccountScopedKey {
  return `account.${accountId}.icloudKey`;
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
    accountAiConfigKey(accountId),
    accountIcloudKeyName(accountId),
  ];
}

export type ProtectedRead =
  | { status: "ok"; value: string }
  | { status: "absent" }
  | { status: "invalidated" }
  | { status: "denied" };

export async function vaultGetProtected(
  key: VaultKeyName,
  prompt: string,
  expectExisting: boolean,
): Promise<ProtectedRead> {
  try {
    const value = await store.getProtected(key, prompt);
    if (value !== null) return { status: "ok", value };
    return expectExisting ? { status: "invalidated" } : { status: "absent" };
  } catch {
    return { status: "denied" };
  }
}

export async function vaultSetProtected(key: VaultKeyName, value: string): Promise<void> {
  return store.setProtected(key, value, "Confirm to save your keys");
}

export async function vaultDeleteProtected(key: VaultKeyName): Promise<void> {
  return store.removeProtected(key);
}

export async function vaultGet(key: VaultKeyName): Promise<string | null> {
  return store.get(key);
}

export async function vaultSet(key: VaultKeyName, value: string): Promise<void> {
  return store.set(key, value);
}

export async function vaultDelete(key: VaultKeyName): Promise<void> {
  return store.remove(key);
}

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
  return accountSecret(accountTdlibDbKeyName(accountId), () => bytesToBase64(Crypto.getRandomBytes(32)));
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

import { VaultKey, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';

import type { PromptFallback, PromptOutcome, PromptPurpose } from './biometric-prompt';
import { promptBiometrics } from './biometrics';
import { hasPin } from './pin';

export interface LockSetup {
  biometric: boolean;
  pin: boolean;
}

export type UnlockMethod = 'biometric' | 'pin';

export async function readLockSetup(): Promise<LockSetup> {
  const [biometric, pin] = await Promise.all([vaultGet(VaultKey.biometricLock), hasPin()]);
  return { biometric: biometric === '1', pin };
}

/** With both set, biometrics go first and the PIN is what a failed prompt falls back to. */
export function unlockMethod(setup: LockSetup): UnlockMethod | null {
  if (setup.biometric) return 'biometric';
  return setup.pin ? 'pin' : null;
}

export async function isLockEnabled(): Promise<boolean> {
  return unlockMethod(await readLockSetup()) !== null;
}

export async function authenticate(purpose: PromptPurpose): Promise<PromptOutcome> {
  const fallback: PromptFallback = (await hasPin()) ? 'pin' : 'passcode';
  return promptBiometrics(purpose, fallback);
}

export async function setLockEnabled(enabled: boolean): Promise<boolean> {
  if (!enabled) {
    await vaultDelete(VaultKey.biometricLock);
    return true;
  }

  if ((await authenticate('turn-on')) !== 'passed') return false;

  await vaultSet(VaultKey.biometricLock, '1');
  return true;
}

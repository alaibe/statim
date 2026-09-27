import * as LocalAuthentication from 'expo-local-authentication';

import { VaultKey, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';

import { hasPin } from './pin';

export interface BiometricCapability {
  available: boolean;
  enrolled: boolean;
  label: string;
}

export async function biometricCapability(): Promise<BiometricCapability> {
  if (process.env.EXPO_OS === 'web') {
    return { available: false, enrolled: false, label: 'Biometrics' };
  }

  const [available, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  return { available, enrolled, label: describe(types) };
}

function describe(types: LocalAuthentication.AuthenticationType[]): string {
  const has = (t: LocalAuthentication.AuthenticationType) => types.includes(t);

  if (has(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return process.env.EXPO_OS === 'ios' ? 'Face ID' : 'Face unlock';
  }
  if (has(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return process.env.EXPO_OS === 'ios' ? 'Touch ID' : 'Fingerprint';
  }
  if (has(LocalAuthentication.AuthenticationType.IRIS)) return 'Iris';
  return 'Biometrics';
}

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

/** What the system prompt offers when biometrics fail: the phone's passcode, or the app PIN. */
export type PromptFallback = 'passcode' | 'pin';

export type PromptOutcome = 'passed' | 'use-pin' | 'failed';

/**
 * With an app PIN, the phone's passcode must not open the app, so the prompt
 * turns the device fallback off. Android shows no fallback button of its own;
 * its one button becomes the way to the PIN.
 */
export function promptOptions(
  reason: string,
  fallback: PromptFallback,
  os = process.env.EXPO_OS
): LocalAuthentication.LocalAuthenticationOptions {
  if (fallback === 'passcode') {
    return { promptMessage: reason, cancelLabel: 'Cancel', fallbackLabel: 'Use passcode' };
  }
  return {
    promptMessage: reason,
    disableDeviceFallback: true,
    fallbackLabel: 'Use PIN',
    cancelLabel: os === 'android' ? 'Use PIN' : 'Cancel',
  };
}

const PIN_INSTEAD: readonly LocalAuthentication.LocalAuthenticationError[] = [
  'user_fallback',
  'lockout',
  'not_enrolled',
  'not_available',
  'passcode_not_set',
];

export function promptOutcome(
  result: LocalAuthentication.LocalAuthenticationResult,
  fallback: PromptFallback,
  os = process.env.EXPO_OS
): PromptOutcome {
  if (result.success) return 'passed';
  if (fallback === 'passcode') return 'failed';
  if (PIN_INSTEAD.includes(result.error)) return 'use-pin';
  if (os === 'android' && result.error === 'user_cancel') return 'use-pin';
  return 'failed';
}

export async function authenticate(reason: string): Promise<PromptOutcome> {
  if (process.env.EXPO_OS === 'web') return 'passed';

  const fallback: PromptFallback = (await hasPin()) ? 'pin' : 'passcode';
  const result = await LocalAuthentication.authenticateAsync(promptOptions(reason, fallback));
  return promptOutcome(result, fallback);
}

export async function setLockEnabled(enabled: boolean, label = 'Biometrics'): Promise<boolean> {
  if (!enabled) {
    await vaultDelete(VaultKey.biometricLock);
    return true;
  }

  const outcome = await authenticate(`Confirm ${label} to protect this app`);
  if (outcome !== 'passed') return false;

  await vaultSet(VaultKey.biometricLock, '1');
  return true;
}

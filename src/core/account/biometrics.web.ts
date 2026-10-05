import { invoke } from '@tauri-apps/api/core';
import type { LocalAuthenticationError } from 'expo-local-authentication';

import {
  type PromptFallback,
  type PromptOutcome,
  type PromptPurpose,
  promptOutcome,
} from './biometric-prompt';
import type { BiometricCapability } from './biometrics';

export type { BiometricCapability } from './biometrics';

export async function biometricCapability(): Promise<BiometricCapability> {
  const { available, enrolled } = await invoke<{ available: boolean; enrolled: boolean }>(
    'biometric_capability'
  );
  return { available, enrolled, label: 'Touch ID' };
}

/** macOS shows the reason as "Statim is trying to …". */
const REASON: Record<PromptPurpose, string> = {
  unlock: 'unlock your chats',
  'turn-on': 'turn on Touch ID for this app',
};

export async function promptBiometrics(
  purpose: PromptPurpose,
  fallback: PromptFallback
): Promise<PromptOutcome> {
  const { success, error } = await invoke<{
    success: boolean;
    error: LocalAuthenticationError | null;
  }>('biometric_authenticate', { reason: REASON[purpose], pinFallback: fallback === 'pin' });
  return promptOutcome(
    success ? { success: true } : { success: false, error: error ?? 'unknown' },
    fallback
  );
}

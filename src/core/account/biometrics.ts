import * as LocalAuthentication from 'expo-local-authentication';

import {
  type PromptFallback,
  type PromptOutcome,
  type PromptPurpose,
  promptOptions,
  promptOutcome,
} from './biometric-prompt';

export interface BiometricCapability {
  available: boolean;
  enrolled: boolean;
  label: string;
}

/** Face ID, Touch ID or the Android equivalents; see biometrics.web.ts for the Mac. */
export async function biometricCapability(): Promise<BiometricCapability> {
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

const REASON: Record<PromptPurpose, string> = {
  unlock: 'Unlock Status Original',
  'turn-on': 'Confirm to lock Status Original',
};

export async function promptBiometrics(
  purpose: PromptPurpose,
  fallback: PromptFallback
): Promise<PromptOutcome> {
  const result = await LocalAuthentication.authenticateAsync(
    promptOptions(REASON[purpose], fallback)
  );
  return promptOutcome(result, fallback);
}

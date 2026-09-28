import type {
  LocalAuthenticationError,
  LocalAuthenticationOptions,
  LocalAuthenticationResult,
} from 'expo-local-authentication';

/** What the system prompt offers when biometrics fail: the device's own passcode or password, or the app PIN. */
export type PromptFallback = 'passcode' | 'pin';

export type PromptOutcome = 'passed' | 'use-pin' | 'failed';

export type PromptPurpose = 'unlock' | 'turn-on';

/**
 * With an app PIN, the phone's passcode must not open the app, so the prompt
 * turns the device fallback off. Android shows no fallback button of its own;
 * its one button becomes the way to the PIN.
 */
export function promptOptions(
  reason: string,
  fallback: PromptFallback,
  os = process.env.EXPO_OS
): LocalAuthenticationOptions {
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

const PIN_INSTEAD: readonly LocalAuthenticationError[] = [
  'user_fallback',
  'lockout',
  'not_enrolled',
  'not_available',
  'passcode_not_set',
];

export function promptOutcome(
  result: LocalAuthenticationResult,
  fallback: PromptFallback,
  os = process.env.EXPO_OS
): PromptOutcome {
  if (result.success) return 'passed';
  if (fallback === 'passcode') return 'failed';
  if (PIN_INSTEAD.includes(result.error)) return 'use-pin';
  if (os === 'android' && result.error === 'user_cancel') return 'use-pin';
  return 'failed';
}

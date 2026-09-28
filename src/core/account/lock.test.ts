import { promptOptions, promptOutcome } from './biometric-prompt';
import { unlockMethod } from './lock';

describe('which way the lock screen unlocks', () => {
  it('asks for the PIN when only a PIN is set', () => {
    expect(unlockMethod({ biometric: false, pin: true })).toBe('pin');
  });

  it('uses biometrics when only the biometric lock is on', () => {
    expect(unlockMethod({ biometric: true, pin: false })).toBe('biometric');
  });

  it('uses biometrics alone when both are set', () => {
    expect(unlockMethod({ biometric: true, pin: true })).toBe('biometric');
  });

  it('has nothing to ask when neither is set', () => {
    expect(unlockMethod({ biometric: false, pin: false })).toBeNull();
  });
});

describe('the system prompt', () => {
  it('keeps the phone passcode as the fallback without an app PIN', () => {
    for (const os of ['ios', 'android']) {
      const options = promptOptions('Unlock', 'passcode', os);
      expect(options.disableDeviceFallback).toBeUndefined();
      expect(options.fallbackLabel).toBe('Use passcode');
    }
  });

  it('turns the phone passcode off and offers the PIN once an app PIN is set', () => {
    expect(promptOptions('Unlock', 'pin', 'ios')).toEqual({
      promptMessage: 'Unlock',
      disableDeviceFallback: true,
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
    });
    expect(promptOptions('Unlock', 'pin', 'android')).toMatchObject({
      disableDeviceFallback: true,
      cancelLabel: 'Use PIN',
    });
  });
});

describe('what a prompt result leads to', () => {
  it('opens on success either way', () => {
    expect(promptOutcome({ success: true }, 'passcode', 'ios')).toBe('passed');
    expect(promptOutcome({ success: true }, 'pin', 'ios')).toBe('passed');
  });

  it('goes to the PIN when the user asks for it on iOS', () => {
    expect(promptOutcome({ success: false, error: 'user_fallback' }, 'pin', 'ios')).toBe('use-pin');
    expect(promptOutcome({ success: false, error: 'user_cancel' }, 'pin', 'ios')).toBe('failed');
  });

  it("goes to the PIN from Android's one button, which is labelled Use PIN", () => {
    expect(promptOutcome({ success: false, error: 'user_cancel' }, 'pin', 'android')).toBe(
      'use-pin'
    );
  });

  it('goes to the PIN when biometrics are locked out or gone', () => {
    for (const error of ['lockout', 'not_enrolled', 'not_available'] as const) {
      expect(promptOutcome({ success: false, error }, 'pin', 'ios')).toBe('use-pin');
    }
  });

  it('never offers a PIN that is not set', () => {
    expect(promptOutcome({ success: false, error: 'user_fallback' }, 'passcode', 'ios')).toBe(
      'failed'
    );
    expect(promptOutcome({ success: false, error: 'user_cancel' }, 'passcode', 'android')).toBe(
      'failed'
    );
  });
});

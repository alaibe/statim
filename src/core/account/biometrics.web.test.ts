import { invoke } from '@tauri-apps/api/core';

import { biometricCapability, promptBiometrics } from './biometrics.web';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }));

const answer = (value: unknown) => jest.mocked(invoke).mockResolvedValueOnce(value);

beforeEach(() => jest.mocked(invoke).mockReset());

it('calls a Mac with a sensor Touch ID', async () => {
  answer({ available: true, enrolled: false });
  expect(await biometricCapability()).toEqual({
    available: true,
    enrolled: false,
    label: 'Touch ID',
  });
});

it('keeps the Mac password as the fallback without an app PIN', async () => {
  answer({ success: false, error: 'user_fallback' });

  expect(await promptBiometrics('unlock', 'passcode')).toBe('failed');
  expect(invoke).toHaveBeenCalledWith('biometric_authenticate', {
    reason: 'unlock your chats',
    pinFallback: false,
  });
});

it('asks for Touch ID alone once a PIN is set, and hands over to the PIN', async () => {
  answer({ success: false, error: 'user_fallback' });
  expect(await promptBiometrics('unlock', 'pin')).toBe('use-pin');
  expect(jest.mocked(invoke).mock.calls[0][1]).toMatchObject({ pinFallback: true });

  answer({ success: false, error: 'user_cancel' });
  expect(await promptBiometrics('unlock', 'pin')).toBe('failed');

  answer({ success: true, error: null });
  expect(await promptBiometrics('turn-on', 'pin')).toBe('passed');
});

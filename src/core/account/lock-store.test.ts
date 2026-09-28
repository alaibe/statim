import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

import * as lock from './lock';
import { isLockEnabled, setLockEnabled } from './lock';
import { useLockStore } from './lock-store';
import { savePin } from './pin';
import { VaultKey } from '@/storage/vault';
import { reportError } from '../app/report-error';

jest.mock('../app/report-error', () => ({ reportError: jest.fn() }));

const authenticateAsync = LocalAuthentication.authenticateAsync as jest.MockedFunction<
  typeof LocalAuthentication.authenticateAsync
>;

beforeEach(() => {
  (SecureStore as unknown as { __reset(): void }).__reset();
  authenticateAsync.mockReset();
  authenticateAsync.mockResolvedValue({ success: true } as never);
  useLockStore.setState({ status: 'checking', setup: null, prompting: false });
});

describe('arming the lock', () => {
  it('requires passing the prompt first', async () => {
    // Otherwise a user whose enrolled biometric does not actually work only
    // finds out on next launch, locked out of the app holding their phrase.
    authenticateAsync.mockResolvedValue({ success: false } as never);

    expect(await setLockEnabled(true)).toBe(false);
    expect(await isLockEnabled()).toBe(false);
  });

  it('persists once the prompt passes', async () => {
    expect(await setLockEnabled(true)).toBe(true);
    expect(await isLockEnabled()).toBe(true);
  });

  it('disarms without prompting', async () => {
    await setLockEnabled(true);
    authenticateAsync.mockClear();

    expect(await setLockEnabled(false)).toBe(true);
    expect(await isLockEnabled()).toBe(false);
    expect(authenticateAsync).not.toHaveBeenCalled();
  });
});

describe('evaluate', () => {
  it('opens straight through when the lock is not armed', async () => {
    await useLockStore.getState().evaluate();
    expect(useLockStore.getState().status).toBe('open');
  });

  it('locks when armed', async () => {
    await SecureStore.setItemAsync(VaultKey.biometricLock, '1');
    await useLockStore.getState().evaluate();
    expect(useLockStore.getState().status).toBe('locked');
  });

  it('locks with a PIN and no biometric lock', async () => {
    await savePin('123456');
    await useLockStore.getState().evaluate();

    expect(useLockStore.getState()).toMatchObject({
      status: 'locked',
      setup: { biometric: false, pin: true },
    });
    expect(await isLockEnabled()).toBe(true);
  });
});

describe('the unlock prompt', () => {
  it('lets the phone passcode through when there is no app PIN', async () => {
    await SecureStore.setItemAsync(VaultKey.biometricLock, '1');
    await useLockStore.getState().evaluate();
    await useLockStore.getState().unlock();

    expect(authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackLabel: 'Use passcode' })
    );
    expect(authenticateAsync.mock.calls[0][0]?.disableDeviceFallback).toBeUndefined();
  });

  it('turns the phone passcode off once an app PIN is set', async () => {
    await SecureStore.setItemAsync(VaultKey.biometricLock, '1');
    await savePin('123456');
    await useLockStore.getState().evaluate();
    await useLockStore.getState().unlock();

    expect(authenticateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ disableDeviceFallback: true, fallbackLabel: 'Use PIN' })
    );
  });

  it('hands over to the PIN when biometrics fail and a PIN is set', async () => {
    authenticateAsync.mockResolvedValue({ success: false, error: 'user_fallback' } as never);
    await SecureStore.setItemAsync(VaultKey.biometricLock, '1');
    await savePin('123456');
    await useLockStore.getState().evaluate();

    expect(await useLockStore.getState().unlock()).toBe('use-pin');
    expect(useLockStore.getState().status).toBe('locked');

    expect(await useLockStore.getState().verifyPin('123456')).toEqual({ result: 'correct' });
    expect(useLockStore.getState().status).toBe('open');
  });
});

describe('the PIN', () => {
  beforeEach(async () => {
    await savePin('123456');
    await useLockStore.getState().evaluate();
  });

  it('opens the app when it is right', async () => {
    expect(await useLockStore.getState().verifyPin('123456')).toEqual({ result: 'correct' });
    expect(useLockStore.getState().status).toBe('open');
    expect(authenticateAsync).not.toHaveBeenCalled();
  });

  it('keeps the app locked when it is wrong', async () => {
    expect(await useLockStore.getState().verifyPin('654321')).toMatchObject({ result: 'wrong' });
    expect(useLockStore.getState().status).toBe('locked');
  });

  it('keeps the app locked by the PIN when the biometric lock is turned off', async () => {
    await useLockStore.getState().setBiometricLock(true);
    await useLockStore.getState().setBiometricLock(false);

    expect(useLockStore.getState().setup).toEqual({ biometric: false, pin: true });
    await useLockStore.getState().evaluate();
    expect(useLockStore.getState().status).toBe('locked');
  });

  it('stops locking the app once removed', async () => {
    await useLockStore.getState().verifyPin('123456');
    await useLockStore.getState().removePin();

    expect(useLockStore.getState().setup).toEqual({ biometric: false, pin: false });
    await useLockStore.getState().evaluate();
    expect(useLockStore.getState().status).toBe('open');
  });
});

describe('unlock', () => {
  it('opens on a successful prompt', async () => {
    await SecureStore.setItemAsync(VaultKey.biometricLock, '1');
    await useLockStore.getState().evaluate();

    expect(await useLockStore.getState().unlock()).toBe('passed');
    expect(useLockStore.getState().status).toBe('open');
  });

  it('stays locked when the prompt is refused', async () => {
    authenticateAsync.mockResolvedValue({ success: false } as never);
    await SecureStore.setItemAsync(VaultKey.biometricLock, '1');
    await useLockStore.getState().evaluate();

    expect(await useLockStore.getState().unlock()).toBe('failed');
    expect(useLockStore.getState().status).toBe('locked');
  });

  it('refuses to stack a second prompt', async () => {
    // iOS cancels both when two prompts race, which reads to the user as
    // biometrics being broken.
    useLockStore.setState({ status: 'locked', prompting: true });

    expect(await useLockStore.getState().unlock()).toBe('failed');
    expect(authenticateAsync).not.toHaveBeenCalled();
  });
});

describe('when the lock setting cannot be read', () => {
  const unreadable = () =>
    jest.spyOn(lock, 'readLockSetup').mockRejectedValueOnce(new Error('keychain'));

  it('locks at launch', async () => {
    unreadable();
    await useLockStore.getState().evaluate();
    expect(useLockStore.getState()).toMatchObject({ status: 'locked', setup: null });
    expect(reportError).toHaveBeenCalled();
  });
});

describe('noteJustAuthenticated', () => {
  it('opens the gate without a second prompt', async () => {
    // Arming the lock in settings already required passing it. Re-evaluating
    // would lock the user out of the screen they are standing on.
    await SecureStore.setItemAsync(VaultKey.biometricLock, '1');
    useLockStore.setState({ status: 'checking' });

    useLockStore.getState().noteJustAuthenticated();

    expect(useLockStore.getState().status).toBe('open');
    expect(authenticateAsync).not.toHaveBeenCalled();
  });
});

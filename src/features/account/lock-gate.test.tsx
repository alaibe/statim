import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { eraseEverything } from '@/core/app/erase-account';
import { useAccountStore } from '@/core/account/account-store';
import { isKeyProtectionEnabled } from '@/core/account/key-protection';
import { authenticate, type LockSetup } from '@/core/account/lock';
import { useLockStore } from '@/core/account/lock-store';
import { checkPin, savePin } from '@/core/account/pin';

import { LockGate } from './lock-gate';

jest.mock('@/design', () => ({
  Button: 'Button',
  Field: 'Field',
  Icon: 'Icon',
  PinDots: 'PinDots',
  PinPad: 'PinPad',
  Screen: 'Screen',
  Text: 'Text',
  cn: (...names: unknown[]) => names.filter(Boolean).join(' '),
  useInertOutside: () => {},
  useThemeColors: () => ({}),
}));
jest.mock('@/core/app/report-error', () => ({ reportError: jest.fn() }));
jest.mock('@/core/app/erase-account', () => ({ eraseEverything: jest.fn(async () => {}) }));
jest.mock('@/core/account/key-protection', () => ({ isKeyProtectionEnabled: jest.fn() }));
jest.mock('@/core/account/biometrics', () => ({
  biometricCapability: async () => ({ available: true, enrolled: true, label: 'Face ID' }),
}));
jest.mock('@/core/account/lock', () => ({
  ...jest.requireActual('@/core/account/lock'),
  authenticate: jest.fn(),
}));

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
let tree: ReactTestRenderer;

const texts = () =>
  tree.root.findAllByType('Text' as never).map((node) => [node.props.children].flat().join(''));
const buttons = () =>
  tree.root.findAllByType('Button' as never).map((node) => node.props.label as string);
const press = (label: string) =>
  act(async () =>
    tree.root
      .findAllByType('Button' as never)
      .find((node) => node.props.label === label)!
      .props.onPress()
  );
const pad = () => tree.root.findAllByType('PinPad' as never)[0];

async function render(setup: LockSetup) {
  useLockStore.setState({ status: 'locked', setup, prompting: false });
  await act(async () => {
    tree = create(createElement(LockGate));
  });
  await settle();
}

async function typePin(pin: string) {
  for (const digit of pin) await act(async () => pad().props.onDigit(digit));
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)));
}

beforeEach(() => {
  (SecureStore as unknown as { __reset(): void }).__reset();
  jest.mocked(isKeyProtectionEnabled).mockReset().mockResolvedValue(false);
  jest.mocked(authenticate).mockReset().mockResolvedValue('passed');
  useAccountStore.setState({ status: 'loading' });
});

afterEach(async () => {
  await act(() => tree?.unmount());
});

it('stays locked with a way to try again when it cannot tell how the app is locked', async () => {
  jest
    .mocked(isKeyProtectionEnabled)
    .mockRejectedValueOnce(new Error('keychain'))
    .mockResolvedValueOnce(false);

  await render({ biometric: true, pin: false });
  expect(texts()).toContain('Could not check how this app is locked.');
  expect(useLockStore.getState().status).toBe('locked');

  await press('Try again');
  await settle();
  expect(useLockStore.getState().status).toBe('open');
});

it('asks for the PIN, and never for biometrics, when only a PIN is set', async () => {
  await savePin('482913');
  await render({ biometric: false, pin: true });

  expect(authenticate).not.toHaveBeenCalled();
  expect(pad().props.extra).toBeUndefined();

  await typePin('482913');
  expect(useLockStore.getState().status).toBe('open');
});

it('stays locked and shakes on a wrong PIN', async () => {
  await savePin('482913');
  await render({ biometric: false, pin: true });

  await typePin('111111');

  expect(useLockStore.getState().status).toBe('locked');
  expect(tree.root.findByType('PinDots' as never).props.shakes).toBe(1);
  expect(texts()).toContain('Wrong PIN. Try again.');
});

it('shows a wait that was running when the lock screen opened, and blocks the keypad', async () => {
  await savePin('482913');
  for (let i = 0; i < 5; i++) await checkPin('000000');
  await render({ biometric: false, pin: true });

  expect(texts().some((text) => text.startsWith('Too many wrong PINs. Try again in 0:'))).toBe(
    true
  );
  expect(pad().props.disabled).toBe(true);
});

it('uses biometrics alone when both are set', async () => {
  await savePin('482913');
  await render({ biometric: true, pin: true });

  expect(authenticate).toHaveBeenCalledTimes(1);
  expect(useLockStore.getState().status).toBe('open');
});

it('offers the PIN when biometrics fail and a PIN is set', async () => {
  jest.mocked(authenticate).mockResolvedValue('failed');
  await render({ biometric: true, pin: true });

  expect(texts()).toContain('Face ID was not recognised.');
  expect(buttons()).toEqual(['Try again', 'Use PIN']);

  await press('Use PIN');
  expect(pad().props.extra).toMatchObject({ label: 'Use Face ID' });

  await act(async () => pad().props.extra.onPress());
  await settle();
  expect(authenticate).toHaveBeenCalledTimes(2);
});

it('goes straight to the PIN when the prompt hands over to it', async () => {
  jest.mocked(authenticate).mockResolvedValue('use-pin');
  await render({ biometric: true, pin: true });

  expect(pad()).toBeDefined();
});

it('offers no PIN when none is set', async () => {
  jest.mocked(authenticate).mockResolvedValue('failed');
  await render({ biometric: true, pin: false });

  expect(buttons()).toEqual(['Try again']);
});

it('keeps to biometrics when keys are protected, PIN or not', async () => {
  jest.mocked(isKeyProtectionEnabled).mockResolvedValue(true);
  useAccountStore.setState({ status: 'blocked' });
  await render({ biometric: true, pin: true });

  expect(authenticate).not.toHaveBeenCalled();
  expect(buttons()).toEqual(['Try again']);
  expect(tree.root.findAllByType('PinPad' as never)).toHaveLength(0);
});

describe('Forgot PIN?', () => {
  it('asks for the word before it will erase anything', async () => {
    await savePin('482913');
    await render({ biometric: false, pin: true });

    await press('Forgot PIN?');
    const erase = () =>
      tree.root.findAllByType('Button' as never).find((b) => b.props.label === 'Erase everything')!;
    expect(erase().props.disabled).toBe(true);

    await act(async () => tree.root.findByType('Field' as never).props.onChangeText('Erase '));
    expect(erase().props.disabled).toBe(false);

    await press('Cancel');
    expect(pad()).toBeDefined();
    expect(eraseEverything).not.toHaveBeenCalled();
  });

  it('erases everything and starts over', async () => {
    await savePin('482913');
    await render({ biometric: false, pin: true });

    await press('Forgot PIN?');
    await act(async () => tree.root.findByType('Field' as never).props.onChangeText('erase'));
    await press('Erase everything');

    expect(eraseEverything).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/(onboarding)/welcome');
  });
});

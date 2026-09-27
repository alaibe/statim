import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { isKeyProtectionEnabled } from '@/core/account/key-protection';
import { useLockStore } from '@/core/account/lock-store';

import { LockGate } from './lock-gate';

jest.mock('@/design', () => ({
  Button: 'Button',
  Icon: 'Icon',
  Screen: 'Screen',
  Text: 'Text',
  useThemeColors: () => ({}),
}));
jest.mock('@/core/app/report-error', () => ({ reportError: jest.fn() }));
jest.mock('@/core/account/key-protection', () => ({ isKeyProtectionEnabled: jest.fn() }));
jest.mock('@/core/account/lock', () => ({
  ...jest.requireActual('@/core/account/lock'),
  biometricCapability: async () => ({ available: true, enrolled: true, label: 'Face ID' }),
  authenticate: async () => 'passed',
}));

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
let tree: ReactTestRenderer;

afterEach(async () => {
  await act(() => tree?.unmount());
});

it('stays locked with a way to try again when it cannot tell how the app is locked', async () => {
  useLockStore.setState({ status: 'locked', prompting: false });
  jest
    .mocked(isKeyProtectionEnabled)
    .mockRejectedValueOnce(new Error('keychain'))
    .mockResolvedValueOnce(false);

  await act(async () => {
    tree = create(createElement(LockGate));
  });
  await settle();
  const texts = () => tree.root.findAllByType('Text' as never).map((node) => node.props.children);
  expect(texts()).toContain('Could not check how this app is locked.');
  expect(useLockStore.getState().status).toBe('locked');

  await act(async () => tree.root.findByType('Button' as never).props.onPress());
  await settle();
  expect(useLockStore.getState().status).toBe('open');
});

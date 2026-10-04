import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import NotificationsScreen from '@/app/(tabs)/(settings)/settings/notifications';

jest.mock('@/design', () => ({
  Icon: 'Icon',
  ListItem: 'ListItem',
  Section: 'Section',
  Text: 'Text',
  Toggle: 'Toggle',
}));
jest.mock('@/features/settings/settings-screen', () => ({ SettingsScreen: 'SettingsScreen' }));

const mockLogin = { opensAtLogin: jest.fn(), setOpenAtLogin: jest.fn() };
jest.mock('@/features/settings/open-at-login', () => ({
  opensAtLogin: () => mockLogin.opensAtLogin(),
  setOpenAtLogin: (on: boolean) => mockLogin.setOpenAtLogin(on),
}));

let tree: ReactTestRenderer;

afterEach(async () => {
  await act(() => tree?.unmount());
});

async function render() {
  await act(async () => {
    tree = create(createElement(NotificationsScreen));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const toggle = () => tree.root.findByProps({ testID: 'open-at-login' }).props.trailing;

it('shows whether the computer opens the app at login', async () => {
  mockLogin.opensAtLogin.mockResolvedValue(true);
  await render();
  expect(toggle().props.value).toBe(true);
});

it('turns the switch back when the computer refuses', async () => {
  mockLogin.opensAtLogin.mockResolvedValue(false);
  mockLogin.setOpenAtLogin.mockRejectedValue(new Error('denied'));
  await render();

  await act(async () => toggle().props.onValueChange(true));

  expect(mockLogin.setOpenAtLogin).toHaveBeenCalledWith(true);
  expect(toggle().props.value).toBe(false);
});

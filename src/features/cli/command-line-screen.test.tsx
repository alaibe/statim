import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import CommandLineScreen from '@/app/(tabs)/(settings)/settings/command-line';

jest.mock('@/design', () => ({
  Button: 'Button',
  Card: 'Card',
  ListItem: 'ListItem',
  Section: 'Section',
  Text: 'Text',
  Toggle: 'Toggle',
}));
jest.mock('@/design/copy-text', () => ({ copyText: jest.fn() }));
jest.mock('@/features/settings/settings-screen', () => ({ SettingsScreen: 'SettingsScreen' }));
jest.mock('@/features/cli/access', () => ({
  isCliAllowed: jest.fn(async () => false),
  setCliAllowed: jest.fn(async () => {}),
}));

const COMMAND = 'sudo ln -sf /Applications/Statim.app/Contents/MacOS/statim /usr/local/bin/statim';
const mockInstall = { cliInstall: jest.fn(), cliLink: jest.fn() };
jest.mock('@/features/cli/install', () => ({
  cliInstall: () => mockInstall.cliInstall(),
  cliLink: () => mockInstall.cliLink(),
}));

let tree: ReactTestRenderer;

beforeEach(() => {
  mockInstall.cliInstall.mockResolvedValue({ installed: false, command: COMMAND, path: null });
});

afterEach(async () => {
  await act(() => tree?.unmount());
});

async function render() {
  await act(async () => {
    tree = create(createElement(CommandLineScreen));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const install = () => tree.root.findByProps({ testID: 'cli-link' });
const texts = () =>
  tree.root.findAllByType('Text' as never).map((node) => [node.props.children].flat().join(''));

it('links the command and then says it is installed', async () => {
  mockInstall.cliLink.mockResolvedValue(true);
  await render();
  mockInstall.cliInstall.mockResolvedValue({ installed: true, command: COMMAND, path: null });

  await act(async () => install().props.onPress());

  expect(mockInstall.cliLink).toHaveBeenCalled();
  expect(texts()).toContain('Installed. Open a terminal and run statim help.');
});

it('keeps the button when the password prompt is cancelled', async () => {
  mockInstall.cliLink.mockResolvedValue(false);
  await render();

  await act(async () => install().props.onPress());

  expect(install().props.loading).toBe(false);
  expect(texts()).not.toContain(COMMAND);
});

it('offers the Terminal line when linking fails', async () => {
  mockInstall.cliLink.mockRejectedValue('Operation not permitted');
  await render();

  await act(async () => install().props.onPress());

  expect(texts().some((text) => text.includes('Operation not permitted'))).toBe(true);
  expect(texts()).toContain(COMMAND);
});

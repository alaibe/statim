import { act, type ComponentType, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { OpenAtLogin, StayConnected } from '@/features/settings/notification-settings';

jest.mock('@/design', () => ({
  Icon: 'Icon',
  ListItem: 'ListItem',
  Section: 'Section',
  Text: 'Text',
  Toggle: 'Toggle',
}));

const mockLogin = { opensAtLogin: jest.fn(), setOpenAtLogin: jest.fn() };
jest.mock('@/features/settings/open-at-login', () => ({
  opensAtLogin: () => mockLogin.opensAtLogin(),
  setOpenAtLogin: (on: boolean) => mockLogin.setOpenAtLogin(on),
}));

const mockStay = { staysConnected: jest.fn(), setStayConnected: jest.fn() };
jest.mock('@/core/stay-connected', () => ({
  staysConnected: () => mockStay.staysConnected(),
  setStayConnected: (on: boolean) => mockStay.setStayConnected(on),
}));

let tree: ReactTestRenderer;

afterEach(async () => {
  await act(() => tree?.unmount());
});

async function render(component: ComponentType) {
  await act(async () => {
    tree = create(createElement(component));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const toggle = (testID: string) => tree.root.findByProps({ testID }).props.trailing;

describe('Open at login', () => {
  it('shows whether the computer opens the app at login', async () => {
    mockLogin.opensAtLogin.mockResolvedValue(true);
    await render(OpenAtLogin);
    expect(toggle('open-at-login').props.value).toBe(true);
  });

  it('turns the switch back when the computer refuses', async () => {
    mockLogin.opensAtLogin.mockResolvedValue(false);
    mockLogin.setOpenAtLogin.mockRejectedValue(new Error('denied'));
    await render(OpenAtLogin);

    await act(async () => toggle('open-at-login').props.onValueChange(true));

    expect(mockLogin.setOpenAtLogin).toHaveBeenCalledWith(true);
    expect(toggle('open-at-login').props.value).toBe(false);
  });
});

describe('Stay connected', () => {
  it('starts from the saved choice and saves a new one', async () => {
    mockStay.staysConnected.mockReturnValue(true);
    await render(StayConnected);
    expect(toggle('stay-connected').props.value).toBe(true);

    await act(async () => toggle('stay-connected').props.onValueChange(false));

    expect(mockStay.setStayConnected).toHaveBeenCalledWith(false);
    expect(toggle('stay-connected').props.value).toBe(false);
  });
});

import { invoke } from '@tauri-apps/api/core';

import { currentUser, saveNotes, signInURL, SignInRequired } from './cloudkit';
import { noteKey, openNote } from './note';
import { relayState, relayToPhone, turnOffRelay, turnOnRelay } from './relay.web';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const mockVault = new Map<string, string>();
let mockFocused = false;

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }));
jest.mock('@/core/notifications', () => ({ appFocused: () => mockFocused }));
jest.mock('@/core/account/key-protection', () => ({
  readMnemonic: async () => ({ status: 'ok', value: PHRASE }),
}));
jest.mock('@/core/account/accounts', () => ({
  loadAccounts: async () => [{ id: 'acc1' }, { id: 'acc2' }],
}));
jest.mock('@/storage/vault', () => ({
  ...jest.requireActual('@/storage/vault'),
  vaultGet: async (key: string) => mockVault.get(key) ?? null,
  vaultSet: async (key: string, value: string) => void mockVault.set(key, value),
  vaultDelete: async (key: string) => void mockVault.delete(key),
}));
jest.mock('./cloudkit', () => ({
  ...jest.requireActual('./cloudkit'),
  signInURL: jest.fn(),
  currentUser: jest.fn(),
  saveNotes: jest.fn(),
}));

const SESSION = 'notifications.icloudSession';
const { key, tag } = noteKey(PHRASE);
const opened = (call: number) =>
  jest.mocked(saveNotes).mock.calls[call][2].map((note) => ({
    tag: note.tag,
    ...openNote(key, note.sealed),
  }));
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  process.env.EXPO_PUBLIC_ICLOUD_API_TOKEN = 'api-token';
  mockVault.clear();
  mockFocused = false;
  jest.mocked(invoke).mockReset();
  jest.mocked(signInURL).mockReset().mockResolvedValue('https://idmsa.apple.com/sign-in');
  jest.mocked(currentUser).mockReset().mockResolvedValue('rolled');
  jest.mocked(saveNotes).mockReset().mockResolvedValue('after-save');
});

async function turnOn(accountId = 'acc1') {
  jest
    .mocked(invoke)
    .mockImplementation(async (command) =>
      command === 'web_login_poll'
        ? { open: true, url: 'https://statim.laibe.cc/icloud?ckWebAuthToken=signed%2Bin' }
        : undefined
    );
  jest.useFakeTimers();
  const done = turnOnRelay(accountId);
  await jest.advanceTimersByTimeAsync(1000);
  await done;
  jest.useRealTimers();
}

describe('notifying the iPhone through iCloud', () => {
  it('is unavailable in a build without an API token', async () => {
    delete process.env.EXPO_PUBLIC_ICLOUD_API_TOKEN;
    expect(await relayState('acc1')).toBe('unavailable');
  });

  it('signs in on Apple’s page, keeps the rolled token and says hello to the iPhone', async () => {
    await turnOn();
    expect(invoke).toHaveBeenCalledWith(
      'web_login_open',
      expect.objectContaining({ url: 'https://idmsa.apple.com/sign-in' })
    );
    expect(invoke).toHaveBeenCalledWith('web_login_close');
    expect(jest.mocked(currentUser).mock.calls[0][1]).toBe('signed+in');
    expect(jest.mocked(saveNotes).mock.calls[0][1]).toBe('rolled');
    expect(opened(0)).toEqual([expect.objectContaining({ tag, chat: '', title: 'Statim' })]);
    expect(mockVault.get(SESSION)).toBe('after-save');
    expect(await relayState('acc1')).toBe('on');
  });

  it('stays quiet while the window has focus', async () => {
    await turnOn();
    mockFocused = true;
    relayToPhone('acc1', { chat: 'xmtp:a', title: 'Alice', body: 'Hi' });
    await flush();
    expect(saveNotes).toHaveBeenCalledTimes(1);
  });

  it('sends what arrives during a save together in the next one', async () => {
    await turnOn();
    let finish: (token: string) => void = () => {};
    jest
      .mocked(saveNotes)
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    relayToPhone('acc1', { chat: 'xmtp:a', title: 'Alice', body: 'one' });
    await flush();
    relayToPhone('acc1', { chat: 'xmtp:b', title: 'Bob', body: 'two' });
    relayToPhone('acc1', { chat: 'xmtp:a', title: 'Alice', body: 'three' });
    finish('t2');
    await flush();
    await flush();
    expect(opened(1).map((note) => note.body)).toEqual(['one']);
    expect(opened(2).map((note) => note.body)).toEqual(['two', 'three']);
    expect(jest.mocked(saveNotes).mock.calls[2][1]).toBe('t2');
  });

  it('notes the sign-out when iCloud drops the token', async () => {
    await turnOn();
    jest.mocked(saveNotes).mockRejectedValueOnce(new SignInRequired(null));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    relayToPhone('acc1', { chat: 'xmtp:a', title: 'Alice', body: 'Hi' });
    await flush();
    await flush();
    expect(await relayState('acc1')).toBe('signed-out');
  });

  it('signs out of iCloud once no account uses it', async () => {
    await turnOn('acc1');
    await turnOn('acc2');
    expect(signInURL).toHaveBeenCalledTimes(1);
    await turnOffRelay('acc1');
    expect(mockVault.has(SESSION)).toBe(true);
    await turnOffRelay('acc2');
    expect(mockVault.has(SESSION)).toBe(false);
    expect(await relayState('acc2')).toBe('off');
  });
});

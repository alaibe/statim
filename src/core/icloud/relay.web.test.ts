import { invoke } from '@tauri-apps/api/core';

import { VaultKey } from '@/storage/vault';
import { asChatId } from '@/core/messaging/testing/ids';

import { saveNotes, signInURL, SignInRequired } from './cloudkit';
import { noteKey, openNote } from './note';
import { relayState, relayToPhone, turnOffRelay, turnOnRelay } from './relay.web';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const mockVault = new Map<string, string>();
let mockFocused = false;

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }));
jest.mock('@/core/notifications', () => ({ appFocused: () => mockFocused }));
jest.mock('@/core/account/key-protection', () => ({
  readAccountSecret: async () => ({ status: 'ok', secret: { kind: 'phrase', phrase: PHRASE } }),
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
  saveNotes: jest.fn(),
}));

const { key, tag } = noteKey({ kind: 'phrase', phrase: PHRASE });
const call = (index: number) => {
  const [, token, notes] = jest.mocked(saveNotes).mock.calls[index];
  return { token, notes };
};
const opened = (index: number) =>
  call(index).notes.map((note) => ({ tag: note.tag, ...openNote(key, note.sealed) }));
const flush = () => jest.advanceTimersByTimeAsync(0);
const arrival = (chat: string, title: string, body: string) => ({
  chatId: asChatId(chat),
  title,
  body,
});

beforeEach(() => {
  jest.useFakeTimers();
  process.env.EXPO_PUBLIC_ICLOUD_API_TOKEN = 'api-token';
  mockVault.clear();
  mockFocused = false;
  jest.mocked(invoke).mockReset();
  jest.mocked(signInURL).mockReset().mockResolvedValue('https://idmsa.apple.com/sign-in');
  jest.mocked(saveNotes).mockReset().mockResolvedValue('after-save');
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function turnOn(accountId = 'acc1') {
  jest
    .mocked(invoke)
    .mockImplementation(async (command) =>
      command === 'browser_sign_in' ? '/icloud?ckWebAuthToken=signed%2Bin' : undefined
    );
  await turnOnRelay(accountId);
}

describe('notifying the iPhone through iCloud', () => {
  it('is unavailable in a build without an API token', async () => {
    delete process.env.EXPO_PUBLIC_ICLOUD_API_TOKEN;
    expect(await relayState('acc1')).toBe('unavailable');
  });

  it('signs in on Apple’s page in the browser and says hello to the iPhone with the token', async () => {
    await turnOn();
    expect(invoke).toHaveBeenCalledWith('browser_sign_in', {
      url: 'https://idmsa.apple.com/sign-in',
      callback: 'http://localhost:47219/icloud',
    });
    expect(call(0).token).toBe('signed+in');
    expect(opened(0)).toEqual([{ tag, title: 'Statim', body: expect.any(String) }]);
    expect(mockVault.get(VaultKey.icloudSession)).toBe('after-save');
    expect(await relayState('acc1')).toBe('on');
  });

  it('stays off when iCloud refuses the hello', async () => {
    jest.mocked(saveNotes).mockRejectedValueOnce(new Error('Did not find record type: Note'));
    await expect(turnOn()).rejects.toThrow('Did not find record type: Note');
    expect(await relayState('acc1')).toBe('off');
    expect(mockVault.has(VaultKey.icloudSession)).toBe(false);
  });

  it('stays quiet while the window has focus', async () => {
    await turnOn();
    mockFocused = true;
    relayToPhone('acc1', arrival('xmtp-a', 'Alice', 'Hi'));
    await flush();
    expect(saveNotes).toHaveBeenCalledTimes(1);
  });

  it('sends what arrives during a save together in the next one', async () => {
    await turnOn();
    let finish: (token: string) => void = () => {};
    jest
      .mocked(saveNotes)
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    relayToPhone('acc1', arrival('xmtp-a', 'Alice', 'one'));
    await flush();
    relayToPhone('acc1', arrival('xmtp-b', 'Bob', 'two'));
    relayToPhone('acc1', arrival('xmtp-a', 'Alice', 'three'));
    finish('t2');
    await flush();
    expect(opened(1).map((note) => note.body)).toEqual(['one']);
    expect(opened(2).map((note) => note.body)).toEqual(['two', 'three']);
    expect(call(2).token).toBe('t2');
  });

  it('notes the sign-out when iCloud drops the token', async () => {
    await turnOn();
    jest.mocked(saveNotes).mockRejectedValueOnce(new SignInRequired(null));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    relayToPhone('acc1', arrival('xmtp-a', 'Alice', 'Hi'));
    await flush();
    expect(await relayState('acc1')).toBe('signed-out');
  });

  it('signs out once no account uses it', async () => {
    await turnOn('acc1');
    await turnOn('acc2');
    expect(signInURL).toHaveBeenCalledTimes(1);
    await turnOffRelay('acc1');
    expect(mockVault.has(VaultKey.icloudSession)).toBe(true);

    await turnOffRelay('acc2');
    expect(saveNotes).toHaveBeenCalledTimes(2);
    expect(mockVault.has(VaultKey.icloudSession)).toBe(false);
    expect(await relayState('acc2')).toBe('off');
  });
});

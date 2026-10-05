import { invoke } from '@tauri-apps/api/core';

import { VaultKey } from '@/storage/vault';
import { asChatId } from '@/core/messaging/testing/ids';

import { changeNotes, signInURL, SignInRequired } from './cloudkit';
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
  changeNotes: jest.fn(),
}));

const MINUTE = 60_000;
const { key, tag } = noteKey(PHRASE);
const call = (index: number) => {
  const [, token, notes, discard] = jest.mocked(changeNotes).mock.calls[index];
  return { token, notes, discard };
};
const opened = (index: number) =>
  call(index).notes.map((note) => ({ tag: note.tag, ...openNote(key, note.sealed) }));
const savedNames = () =>
  (JSON.parse(mockVault.get(VaultKey.icloudNotes) ?? '[]') as { name: string }[]).map(
    (note) => note.name
  );
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
  jest.mocked(changeNotes).mockReset().mockResolvedValue({ token: 'after-save', undeleted: [] });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

async function turnOn(accountId = 'acc1') {
  jest
    .mocked(invoke)
    .mockImplementation(async (command) =>
      command === 'loopback_sign_in' ? '/icloud?ckWebAuthToken=signed%2Bin' : undefined
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
    expect(invoke).toHaveBeenCalledWith('loopback_sign_in', {
      url: 'https://idmsa.apple.com/sign-in',
      port: 47219,
      path: '/icloud',
    });
    expect(call(0).token).toBe('signed+in');
    expect(opened(0)).toEqual([{ tag, title: 'Statim', body: expect.any(String) }]);
    expect(mockVault.get(VaultKey.icloudSession)).toBe('after-save');
    expect(await relayState('acc1')).toBe('on');
  });

  it('stays quiet while the window has focus', async () => {
    await turnOn();
    mockFocused = true;
    relayToPhone('acc1', arrival('xmtp-a', 'Alice', 'Hi'));
    await flush();
    expect(changeNotes).toHaveBeenCalledTimes(1);
  });

  it('sends what arrives during a save together in the next one', async () => {
    await turnOn();
    let finish: (changed: { token: string; undeleted: string[] }) => void = () => {};
    jest
      .mocked(changeNotes)
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    relayToPhone('acc1', arrival('xmtp-a', 'Alice', 'one'));
    await flush();
    relayToPhone('acc1', arrival('xmtp-b', 'Bob', 'two'));
    relayToPhone('acc1', arrival('xmtp-a', 'Alice', 'three'));
    finish({ token: 't2', undeleted: [] });
    await flush();
    expect(opened(1).map((note) => note.body)).toEqual(['one']);
    expect(opened(2).map((note) => note.body)).toEqual(['two', 'three']);
    expect(call(2).token).toBe('t2');
  });

  it('deletes each note five minutes after saving it', async () => {
    await turnOn();
    const hello = call(0).notes[0].name;
    expect(savedNames()).toEqual([hello]);
    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(call(1)).toMatchObject({ notes: [], discard: [hello] });
    expect(savedNames()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('deletes notes a previous run left with the next save', async () => {
    await turnOn();
    const hello = call(0).notes[0].name;
    jest.clearAllTimers();
    jest.setSystemTime(Date.now() + 6 * MINUTE);
    relayToPhone('acc1', arrival('xmtp-a', 'Alice', 'Hi'));
    await flush();
    expect(call(1).discard).toEqual([hello]);
    expect(savedNames()).toEqual([call(1).notes[0].name]);
  });

  it('tries again later to delete a note iCloud kept', async () => {
    await turnOn();
    const hello = call(0).notes[0].name;
    jest.mocked(changeNotes).mockResolvedValueOnce({ token: 't', undeleted: [hello] });
    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(savedNames()).toEqual([hello]);
    await jest.advanceTimersByTimeAsync(5 * MINUTE);
    expect(call(2).discard).toEqual([hello]);
    expect(savedNames()).toEqual([]);
  });

  it('notes the sign-out when iCloud drops the token', async () => {
    await turnOn();
    jest.mocked(changeNotes).mockRejectedValueOnce(new SignInRequired(null));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    relayToPhone('acc1', arrival('xmtp-a', 'Alice', 'Hi'));
    await flush();
    expect(await relayState('acc1')).toBe('signed-out');
  });

  it('deletes every note left and signs out once no account uses it', async () => {
    await turnOn('acc1');
    await turnOn('acc2');
    expect(signInURL).toHaveBeenCalledTimes(1);
    await turnOffRelay('acc1');
    expect(mockVault.has(VaultKey.icloudSession)).toBe(true);
    expect(changeNotes).toHaveBeenCalledTimes(2);

    await turnOffRelay('acc2');
    expect(call(2)).toMatchObject({
      notes: [],
      discard: [call(0).notes[0].name, call(1).notes[0].name],
    });
    expect(savedNames()).toEqual([]);
    expect(mockVault.has(VaultKey.icloudSession)).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    expect(await relayState('acc2')).toBe('off');
  });
});

import { invoke } from '@tauri-apps/api/core';

import { changeNotes, currentUser, signInURL, SignInRequired } from './cloudkit';
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
  changeNotes: jest.fn(),
}));

const SESSION = 'notifications.icloudSession';
const MINUTE = 60_000;
const { key, tag } = noteKey(PHRASE);
const call = (index: number) => {
  const [, token, notes, discard] = jest.mocked(changeNotes).mock.calls[index];
  return { token, notes, discard: discard ?? [] };
};
const opened = (index: number) =>
  call(index).notes.map((note) => ({ tag: note.tag, ...openNote(key, note.sealed) }));
const savedNames = () =>
  (JSON.parse(mockVault.get('notifications.icloudNotes') ?? '[]') as { name: string }[]).map(
    (note) => note.name
  );
const flush = () => jest.advanceTimersByTimeAsync(0);

beforeEach(() => {
  jest.useFakeTimers();
  process.env.EXPO_PUBLIC_ICLOUD_API_TOKEN = 'api-token';
  mockVault.clear();
  mockFocused = false;
  jest.mocked(invoke).mockReset();
  jest.mocked(signInURL).mockReset().mockResolvedValue('https://idmsa.apple.com/sign-in');
  jest.mocked(currentUser).mockReset().mockResolvedValue('rolled');
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
      command === 'web_login_poll'
        ? { open: true, url: 'https://statim.laibe.cc/icloud?ckWebAuthToken=signed%2Bin' }
        : undefined
    );
  const done = turnOnRelay(accountId);
  await jest.advanceTimersByTimeAsync(1000);
  await done;
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
      expect.objectContaining({
        url: 'https://idmsa.apple.com/sign-in',
        stopAt: 'https://statim.laibe.cc/icloud',
      })
    );
    expect(invoke).toHaveBeenCalledWith('web_login_close');
    expect(jest.mocked(currentUser).mock.calls[0][1]).toBe('signed+in');
    expect(call(0).token).toBe('rolled');
    expect(opened(0)).toEqual([expect.objectContaining({ tag, chat: '', title: 'Statim' })]);
    expect(mockVault.get(SESSION)).toBe('after-save');
    expect(await relayState('acc1')).toBe('on');
  });

  it('stays quiet while the window has focus', async () => {
    await turnOn();
    mockFocused = true;
    relayToPhone('acc1', { chat: 'xmtp:a', title: 'Alice', body: 'Hi' });
    await flush();
    expect(changeNotes).toHaveBeenCalledTimes(1);
  });

  it('sends what arrives during a save together in the next one', async () => {
    await turnOn();
    let finish: (changed: { token: string; undeleted: string[] }) => void = () => {};
    jest
      .mocked(changeNotes)
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    relayToPhone('acc1', { chat: 'xmtp:a', title: 'Alice', body: 'one' });
    await flush();
    relayToPhone('acc1', { chat: 'xmtp:b', title: 'Bob', body: 'two' });
    relayToPhone('acc1', { chat: 'xmtp:a', title: 'Alice', body: 'three' });
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
    relayToPhone('acc1', { chat: 'xmtp:a', title: 'Alice', body: 'Hi' });
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
    relayToPhone('acc1', { chat: 'xmtp:a', title: 'Alice', body: 'Hi' });
    await flush();
    expect(await relayState('acc1')).toBe('signed-out');
  });

  it('deletes every note left and signs out once no account uses it', async () => {
    await turnOn('acc1');
    await turnOn('acc2');
    expect(signInURL).toHaveBeenCalledTimes(1);
    await turnOffRelay('acc1');
    expect(mockVault.has(SESSION)).toBe(true);
    expect(changeNotes).toHaveBeenCalledTimes(2);

    await turnOffRelay('acc2');
    expect(call(2)).toMatchObject({
      notes: [],
      discard: [call(0).notes[0].name, call(1).notes[0].name],
    });
    expect(savedNames()).toEqual([]);
    expect(mockVault.has(SESSION)).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    expect(await relayState('acc2')).toBe('off');
  });
});

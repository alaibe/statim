import { hereState, networkOf, runHere } from './local-homeserver';

const mockState = { available: true, url: 'http://127.0.0.1:47280' };
let mockConfig: Record<string, string> = {};
const mockVault = new Map<string, string>();
const mockUpdate = jest.fn();

jest.mock('@/core/homeserver', () => ({
  localHomeserverUrl: async () => (mockState.available ? mockState.url : null),
  startHomeserver: async () => mockState.url,
  homeserverSession: async () => ({
    accessToken: 'token',
    userId: '@me:statim',
    deviceId: 'DEVICE',
    homeserverUrl: mockState.url,
  }),
}));
jest.mock('@/core/messaging/config', () => ({
  loadProtocolConfig: async () => mockConfig,
}));
jest.mock('@/runtime', () => ({
  accountRuntime: { updateProtocolConfig: (...args: unknown[]) => mockUpdate(...args) },
}));
const mockErased: string[] = [];
jest.mock('@/storage/media', () => ({
  eraseAccountDirectory: async (area: string, accountId: string) =>
    void mockErased.push(`${area}/${accountId}`),
}));
jest.mock('@/storage/vault', () => ({
  ...jest.requireActual('@/storage/vault'),
  vaultSet: async (key: string, value: string) => void mockVault.set(key, value),
}));

beforeEach(() => {
  mockState.available = true;
  mockConfig = {};
  mockVault.clear();
  mockUpdate.mockReset();
  mockErased.length = 0;
});

describe('Matrix on this computer', () => {
  it('is offered only where the server can run, and only to an account without a homeserver', async () => {
    expect(await hereState('acc1')).toBe('off');
    mockConfig = { homeserver: 'https://matrix.example.org' };
    expect(await hereState('acc1')).toBe('elsewhere');
    mockConfig = { homeserver: 'http://127.0.0.1:47280/' };
    expect(await hereState('acc1')).toBe('on');
    mockState.available = false;
    expect(await hereState('acc1')).toBe('unavailable');
  });

  it('starts a new store, saves the signed-in session and points Matrix at this computer', async () => {
    await runHere('acc1');
    expect(mockErased).toEqual(['matrix/acc1']);
    expect(JSON.parse(mockVault.get('account.acc1.matrixSession')!)).toMatchObject({
      userId: '@me:statim',
      homeserverUrl: 'http://127.0.0.1:47280',
    });
    expect(mockUpdate).toHaveBeenCalledWith('acc1', 'matrix', {
      homeserver: 'http://127.0.0.1:47280',
      userId: '@me:statim',
    });
  });

  it('names each bridge by the network it brings in', () => {
    expect(['whatsapp', 'facebook', 'instagram', 'discord'].map(networkOf)).toEqual([
      'WhatsApp',
      'Messenger',
      'Instagram',
      'Discord',
    ]);
  });
});

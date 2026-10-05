import { hereState, runHere } from './local-homeserver';

const mockState = { available: true, running: false, url: 'http://127.0.0.1:47280' };
let mockConfig: Record<string, string> = {};
const mockVault = new Map<string, string>();
const mockUpdate = jest.fn();

jest.mock('@/core/homeserver', () => ({
  homeserverState: async () => mockState,
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
jest.mock('@/storage/vault', () => ({
  ...jest.requireActual('@/storage/vault'),
  vaultSet: async (key: string, value: string) => void mockVault.set(key, value),
}));

beforeEach(() => {
  mockState.available = true;
  mockConfig = {};
  mockVault.clear();
  mockUpdate.mockReset();
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

  it('saves the signed-in session and points Matrix at this computer', async () => {
    await runHere('acc1');
    expect(JSON.parse(mockVault.get('account.acc1.matrixSession')!)).toMatchObject({
      userId: '@me:statim',
      homeserverUrl: 'http://127.0.0.1:47280',
    });
    expect(mockUpdate).toHaveBeenCalledWith('acc1', 'matrix', {
      homeserver: 'http://127.0.0.1:47280',
      userId: '@me:statim',
    });
  });
});

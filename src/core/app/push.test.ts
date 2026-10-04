import { useChatStore } from '../messaging/chat-store';
import type { ChatSession, PushTarget } from '../messaging/protocol';
import { setPushServer, watchPush } from './push';

const mockVault = new Map<string, string>();
jest.mock('@/storage/vault', () => ({
  VaultKey: { pushServer: 'notifications.pushServer' },
  vaultGet: async (key: string) => mockVault.get(key) ?? null,
  vaultSet: async (key: string, value: string) => void mockVault.set(key, value),
  vaultDelete: async (key: string) => void mockVault.delete(key),
}));
jest.mock('expo-notifications', () => ({
  getDevicePushTokenAsync: async () => ({ type: 'ios', data: 'cd'.repeat(32) }),
}));
jest.mock('expo-constants', () => ({
  expoConfig: { ios: { bundleIdentifier: 'im.statim.app' } },
}));

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function session() {
  const calls: (PushTarget | null)[] = [];
  const registerPush = async (target: PushTarget | null) => void calls.push(target);
  return { session: { registerPush } as unknown as ChatSession, calls };
}

it('registers each ready protocol once, again on a new server, and stops when turned off', async () => {
  mockVault.set('notifications.pushServer', 'https://push.example.org');
  const matrix = session();
  const telegram = session();
  useChatStore.setState({
    accountId: 'acc1',
    sessions: { matrix: matrix.session, telegram: telegram.session },
    protocols: {
      matrix: { status: 'ready' },
      telegram: { status: 'connecting' },
    } as never,
  });

  watchPush();
  await flush();
  const target = {
    server: 'https://push.example.org',
    deviceToken: 'cd'.repeat(32),
    topic: 'im.statim.app',
    accountId: 'acc1',
  };
  expect(matrix.calls).toEqual([target]);
  expect(telegram.calls).toEqual([]);

  useChatStore.setState({
    protocols: { matrix: { status: 'ready' }, telegram: { status: 'ready' } } as never,
  });
  await flush();
  expect(matrix.calls).toEqual([target]);
  expect(telegram.calls).toEqual([target]);

  await setPushServer('https://other.example.org');
  expect(matrix.calls.at(-1)).toEqual({ ...target, server: 'https://other.example.org' });

  await setPushServer(null);
  expect(matrix.calls.at(-1)).toBeNull();
  expect(telegram.calls.at(-1)).toBeNull();
  expect(mockVault.has('notifications.pushServer')).toBe(false);
});

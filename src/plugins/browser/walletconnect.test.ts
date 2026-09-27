import type { PluginContext } from '@/core/plugins/types';

import { handleSessionRequest } from './rpc';
import { useWalletConnectStore, type PendingItem } from './walletconnect';

jest.mock('./rpc', () => ({ handleSessionRequest: jest.fn() }));
jest.mock('@walletconnect/utils', () => ({
  getSdkError: (key: string) => ({ code: 5000, message: key }),
}));

const context = {
  ui: { notify: jest.fn(), openExternalUrl: jest.fn(async () => {}) },
  account: { address: '0x0000000000000000000000000000000000000001' },
} as unknown as PluginContext;

function request(id: number): PendingItem {
  return {
    kind: 'request',
    id,
    topic: 'topic',
    method: 'personal_sign',
    params: [],
    chainId: 'eip155:1',
    siteName: 'Site',
  };
}

function queueWithPendingSignature() {
  const kit = {
    respondSessionRequest: jest.fn(async () => {}),
    getActiveSessions: () => ({}),
  };
  let sign: (signature: string) => void = () => {};
  jest.mocked(handleSessionRequest).mockReturnValue(
    new Promise((resolve) => {
      sign = resolve;
    })
  );
  const next = request(2);
  useWalletConnectStore.setState({ kit: kit as never, queue: [request(1), next], answering: null });
  return { kit, next, sign: (signature: string) => sign(signature) };
}

test('approving the same request twice answers it once and keeps the next one queued', async () => {
  const { kit, next, sign } = queueWithPendingSignature();
  const store = useWalletConnectStore.getState();

  const first = store.approveHead(context);
  const second = store.approveHead(context);
  sign('0xsigned');
  await Promise.all([first, second]);

  expect(kit.respondSessionRequest).toHaveBeenCalledTimes(1);
  expect(kit.respondSessionRequest).toHaveBeenCalledWith({
    topic: 'topic',
    response: { id: 1, jsonrpc: '2.0', result: '0xsigned' },
  });
  expect(useWalletConnectStore.getState().queue).toEqual([next]);
  expect(useWalletConnectStore.getState().answering).toBeNull();
});

test('rejecting while a signature is pending leaves the approval to finish', async () => {
  const { kit, next, sign } = queueWithPendingSignature();
  const store = useWalletConnectStore.getState();

  const approval = store.approveHead(context);
  const rejection = store.rejectHead();
  sign('0xsigned');
  await Promise.all([approval, rejection]);

  expect(kit.respondSessionRequest).toHaveBeenCalledTimes(1);
  expect(kit.respondSessionRequest).toHaveBeenCalledWith(
    expect.objectContaining({ response: expect.objectContaining({ result: '0xsigned' }) })
  );
  expect(useWalletConnectStore.getState().queue).toEqual([next]);
});

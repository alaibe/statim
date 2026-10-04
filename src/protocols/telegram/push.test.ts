import { p256 } from '@noble/curves/nist.js';

import { base64ToBytes } from '@/lib/bytes';
import { registerDevice } from './push';

const mockShared = new Map<string, string>();
jest.mock('@/storage/shared-keychain', () => ({
  pushSecretKey: (protocol: string, accountId: string) => `push.${protocol}.${accountId}`,
  sharedWithExtension: async (key: string) => mockShared.get(key) ?? null,
  shareWithExtension: async (key: string, value: string) => void mockShared.set(key, value),
  unshare: async (key: string) => void mockShared.delete(key),
}));

const TARGET = {
  server: 'https://push.example.org',
  deviceToken: 'ab'.repeat(32),
  topic: 'im.statim.app',
  accountId: 'acc1',
};

const fromBase64Url = (text: string) =>
  base64ToBytes(
    text
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(text.length / 4) * 4, '=')
  );

interface DeviceToken {
  endpoint: string;
  p256dh_base64url: string;
  auth_base64url: string;
}

it('registers a web push endpoint on the forwarder with keys the extension can open', async () => {
  const request = await registerDevice(TARGET);
  const token = request.device_token as DeviceToken;

  expect(request['@type']).toBe('registerDevice');
  expect(token.endpoint).toBe(`https://push.example.org/telegram/${TARGET.deviceToken}/acc1`);

  const shared = JSON.parse(mockShared.get('push.telegram.acc1')!);
  expect(token.p256dh_base64url).toBe(shared.publicKey);
  expect(token.auth_base64url).toBe(shared.auth);
  expect(fromBase64Url(shared.auth)).toHaveLength(16);
  expect(fromBase64Url(shared.publicKey)).toEqual(
    p256.getPublicKey(fromBase64Url(shared.privateKey), false)
  );
});

it('keeps the same keys when it registers again', async () => {
  const first = (await registerDevice(TARGET)).device_token as DeviceToken;
  const again = (await registerDevice(TARGET)).device_token as DeviceToken;

  expect(again.p256dh_base64url).toBe(first.p256dh_base64url);
});

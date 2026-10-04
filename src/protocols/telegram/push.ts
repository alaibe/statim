import { p256 } from '@noble/curves/nist.js';

import type { PushTarget } from '@/core/messaging/protocol';
import { bytesToBase64 } from '@/lib/bytes';
import { randomBytes } from '@/lib/random';
import {
  pushSecretKey,
  sharedWithExtension,
  shareWithExtension,
  unshare,
} from '@/storage/shared-keychain';
import type { TdObject } from './api';

/** Telegram encrypts each push to the public key; the notification extension holds the private one. */
interface WebPushKeys {
  privateKey: string;
  publicKey: string;
  auth: string;
}

export async function registerDevice(target: PushTarget): Promise<TdObject> {
  const keys = await webPushKeys(target.accountId);
  return {
    '@type': 'registerDevice',
    device_token: {
      '@type': 'deviceTokenWebPush',
      endpoint: `${target.server}/telegram/${target.deviceToken}/${target.accountId}`,
      p256dh_base64url: keys.publicKey,
      auth_base64url: keys.auth,
    },
    other_user_ids: [],
  };
}

/** An empty endpoint tells Telegram to stop. */
export const UNREGISTER_DEVICE: TdObject = {
  '@type': 'registerDevice',
  device_token: {
    '@type': 'deviceTokenWebPush',
    endpoint: '',
    p256dh_base64url: '',
    auth_base64url: '',
  },
  other_user_ids: [],
};

export function forgetWebPushKeys(accountId: string): Promise<void> {
  return unshare(pushSecretKey('telegram', accountId));
}

async function webPushKeys(accountId: string): Promise<WebPushKeys> {
  const stored = await sharedWithExtension(pushSecretKey('telegram', accountId));
  if (stored) return JSON.parse(stored) as WebPushKeys;
  const secret = p256.utils.randomSecretKey();
  const keys = {
    privateKey: base64url(secret),
    publicKey: base64url(p256.getPublicKey(secret, false)),
    auth: base64url(randomBytes(16)),
  };
  await shareWithExtension(pushSecretKey('telegram', accountId), JSON.stringify(keys));
  return keys;
}

function base64url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

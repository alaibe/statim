import { gunzipSync, strFromU8 } from 'fflate';
import type { AnimationObject } from 'lottie-react-native';

import { readMediaBytes } from '@/core/messaging/media-store';

const KEPT = 12;
const animations = new Map<string, Promise<AnimationObject>>();

export function loadLottie(uri: string): Promise<AnimationObject> {
  const cached = animations.get(uri);
  if (cached) {
    animations.delete(uri);
    animations.set(uri, cached);
    return cached;
  }
  const loading = readMediaBytes(uri).then(parseLottie);
  loading.catch(() => animations.delete(uri));
  animations.set(uri, loading);
  if (animations.size > KEPT) {
    const oldest = animations.keys().next().value;
    if (oldest !== undefined) animations.delete(oldest);
  }
  return loading;
}

/** Telegram gzips its Lottie stickers; a bridge may hand them over already unpacked. */
export function parseLottie(bytes: Uint8Array): AnimationObject {
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
  return JSON.parse(strFromU8(gzipped ? gunzipSync(bytes) : bytes)) as AnimationObject;
}

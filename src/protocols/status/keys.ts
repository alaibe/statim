import { base58 } from '@scure/base';

import type { DerivedKey } from '@/core/account/keyring';
import type { ParticipantId } from '@/core/messaging/types';
import { concat, fromHex, toHex } from '@/lib/bytes';

import { compressPublicKey, decompressPublicKey, isPublicKey, publicKeyOf } from './crypto';

/** EIP-1581's chat key: a Status recovery phrase gives the same key in both apps. */
export const STATUS_CHAT_KEY_PATH = "m/43'/60'/1581'/0'/0";

const SECP256K1_MULTICODEC = Uint8Array.of(0xe7, 0x01);

export interface StatusIdentity {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  participantId: ParticipantId;
}

export function identityFrom(derive: (path: string) => DerivedKey): StatusIdentity {
  const privateKey = derive(STATUS_CHAT_KEY_PATH).privateKey.slice(0, 32);
  const publicKey = publicKeyOf(privateKey);
  return { privateKey, publicKey, participantId: participantIdOf(publicKey) };
}

/** The id status-go gives a contact: the uncompressed key, 0x-prefixed. */
export function participantIdOf(publicKey: Uint8Array): ParticipantId {
  return `0x${toHex(publicKey)}`;
}

export function publicKeyFromParticipant(id: ParticipantId): Uint8Array {
  const key = fromHex(id);
  if (key.length !== 65 || !isPublicKey(key)) throw new Error(`${id} is not a Status chat key`);
  return key;
}

/** The `zQ3sh…` form the Status app shows and shares. */
export function chatKeyOf(key: Uint8Array | ParticipantId): string {
  const publicKey = typeof key === 'string' ? publicKeyFromParticipant(key) : key;
  return `z${base58.encode(concat([SECP256K1_MULTICODEC, compressPublicKey(publicKey)]))}`;
}

function fromChatKey(value: string): Uint8Array | null {
  if (!value.startsWith('z')) return null;
  try {
    const decoded = base58.decode(value.slice(1));
    if (decoded[0] !== SECP256K1_MULTICODEC[0] || decoded[1] !== SECP256K1_MULTICODEC[1]) {
      return null;
    }
    return decompressPublicKey(decoded.subarray(2));
  } catch {
    return null;
  }
}

function fromHexKey(value: string): Uint8Array | null {
  const hex = value.replace(/^0x/i, '');
  if (!/^(04[0-9a-f]{128}|0[23][0-9a-f]{64})$/i.test(hex)) return null;
  try {
    return decompressPublicKey(fromHex(hex.toLowerCase()));
  } catch {
    return null;
  }
}

/** A chat key as pasted: `zQ3sh…`, 0x04… or compressed hex, or a status.app profile link. */
export function parseChatKey(input: string): ParticipantId | null {
  const trimmed = input.trim();
  const fragment = trimmed.includes('#') ? trimmed.slice(trimmed.lastIndexOf('#') + 1) : trimmed;
  const key = fromChatKey(fragment) ?? fromHexKey(fragment);
  return key && participantIdOf(key);
}

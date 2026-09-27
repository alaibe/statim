import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';

import type { DerivedKey } from '@/core/account/keyring';
import { encodeNpub } from '@/lib/bech32';
import { randomBytes } from '@/lib/random';

export const NOSTR_DERIVATION_PATH = "m/44'/1237'/0'/0/0";

export interface NostrKeys {
  secretKey: Uint8Array;
  publicKey: string;
  npub: string;
}

export function keysFromDerivedKey(key: DerivedKey): NostrKeys {
  const secretKey = key.privateKey.slice(0, 32);
  return keysFromSecretKey(secretKey);
}

export function keysFromSecretKey(secretKey: Uint8Array): NostrKeys {
  const publicKeyBytes = schnorr.getPublicKey(secretKey);
  return {
    secretKey,
    publicKey: bytesToHex(publicKeyBytes),
    npub: encodeNpub(publicKeyBytes),
  };
}

export function ephemeralKeys(): NostrKeys {
  return keysFromSecretKey(randomBytes(32));
}

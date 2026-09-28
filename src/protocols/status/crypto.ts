import { ctr, gcm } from '@noble/ciphers/aes';
import { secp256k1 } from '@noble/curves/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
import { keccak_256 } from '@noble/hashes/sha3';
import { utf8ToBytes } from '@noble/hashes/utils';

import { concat, timingSafeEqual } from '@/lib/bytes';
import { randomBytes } from '@/lib/random';

export function keccak256(...parts: Uint8Array[]): Uint8Array {
  return keccak_256(concat(parts));
}

export function randomPrivateKey(): Uint8Array {
  for (;;) {
    const candidate = randomBytes(32);
    if (secp256k1.utils.isValidPrivateKey(candidate)) return candidate;
  }
}

export function publicKeyOf(privateKey: Uint8Array): Uint8Array {
  return secp256k1.getPublicKey(privateKey, false);
}

export function compressPublicKey(publicKey: Uint8Array): Uint8Array {
  return secp256k1.ProjectivePoint.fromHex(publicKey).toRawBytes(true);
}

export function decompressPublicKey(publicKey: Uint8Array): Uint8Array {
  return secp256k1.ProjectivePoint.fromHex(publicKey).toRawBytes(false);
}

export function isPublicKey(bytes: Uint8Array): boolean {
  try {
    secp256k1.ProjectivePoint.fromHex(bytes).assertValidity();
    return true;
  } catch {
    return false;
  }
}

/** go-ethereum's `crypto.Sign`: 65 bytes, r ‖ s ‖ v with v in {0, 1}. */
export function sign(hash: Uint8Array, privateKey: Uint8Array): Uint8Array {
  const signature = secp256k1.sign(hash, privateKey, { lowS: true });
  return concat([signature.toCompactRawBytes(), Uint8Array.of(signature.recovery)]);
}

export function recoverPublicKey(hash: Uint8Array, signature: Uint8Array): Uint8Array | null {
  if (signature.length !== 65 || signature[64] > 3) return null;
  try {
    return secp256k1.Signature.fromCompact(signature.subarray(0, 64))
      .addRecoveryBit(signature[64])
      .recoverPublicKey(hash)
      .toRawBytes(false);
  } catch {
    return null;
  }
}

/** The x coordinate of the shared point, as go-ethereum's `ecies.GenerateShared(pub, 16, 16)` returns it. */
export function sharedSecret(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return secp256k1.getSharedSecret(privateKey, publicKey, true).subarray(1);
}

const NONCE_LENGTH = 12;

/** status-go's `EncryptSymmetric`: AES-256-GCM with the nonce appended. */
export function encryptSymmetric(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const nonce = randomBytes(NONCE_LENGTH);
  return concat([gcm(key, nonce).encrypt(plaintext), nonce]);
}

export function decryptSymmetric(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length < NONCE_LENGTH) throw new Error('Symmetric payload is too short');
  const nonce = data.subarray(data.length - NONCE_LENGTH);
  return gcm(key, nonce).decrypt(data.subarray(0, data.length - NONCE_LENGTH));
}

/** status-go's `common.Decrypt`, used for profile pictures: AES-256-GCM with the nonce in front. */
export function decryptNonceFirst(key: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length < NONCE_LENGTH) throw new Error('Encrypted payload is too short');
  return gcm(key, data.subarray(0, NONCE_LENGTH)).decrypt(data.subarray(NONCE_LENGTH));
}

/** Waku's password-derived symmetric keys: PBKDF2-SHA256, no salt, 65356 rounds. */
export function symmetricKeyFromPassword(password: string): Uint8Array {
  return pbkdf2(sha256, utf8ToBytes(password), new Uint8Array(), { c: 65356, dkLen: 32 });
}

const ECIES_KEY_LENGTH = 16;
const ECIES_BLOCK = 16;
const ECIES_TAG = 32;
const UNCOMPRESSED = 65;

function eciesKeys(shared: Uint8Array): { encryption: Uint8Array; mac: Uint8Array } {
  const derived = sha256(concat([Uint8Array.of(0, 0, 0, 1), shared]));
  return {
    encryption: derived.subarray(0, ECIES_KEY_LENGTH),
    mac: sha256(derived.subarray(ECIES_KEY_LENGTH)),
  };
}

/** go-ethereum `crypto/ecies` with its secp256k1 parameters (AES-128-CTR, HMAC-SHA256). */
export function eciesEncrypt(recipient: Uint8Array, message: Uint8Array): Uint8Array {
  const ephemeral = randomPrivateKey();
  const keys = eciesKeys(sharedSecret(ephemeral, recipient));
  const iv = randomBytes(ECIES_BLOCK);
  const body = concat([iv, ctr(keys.encryption, iv).encrypt(message)]);
  return concat([publicKeyOf(ephemeral), body, hmac(sha256, keys.mac, body)]);
}

export function eciesDecrypt(privateKey: Uint8Array, data: Uint8Array): Uint8Array {
  if (data.length < UNCOMPRESSED + ECIES_BLOCK + ECIES_TAG || data[0] !== 4) {
    throw new Error('Not an ECIES message');
  }
  const ephemeral = data.subarray(0, UNCOMPRESSED);
  const body = data.subarray(UNCOMPRESSED, data.length - ECIES_TAG);
  const keys = eciesKeys(sharedSecret(privateKey, ephemeral));
  if (!timingSafeEqual(hmac(sha256, keys.mac, body), data.subarray(data.length - ECIES_TAG))) {
    throw new Error('ECIES message authentication failed');
  }
  return ctr(keys.encryption, body.subarray(0, ECIES_BLOCK)).decrypt(body.subarray(ECIES_BLOCK));
}

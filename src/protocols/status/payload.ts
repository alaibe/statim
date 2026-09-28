/**
 * The 26/WAKU2-PAYLOAD codec status-go wraps every message in: a flags byte,
 * the payload size, the payload, random padding to a multiple of 256 and a
 * signature, then ECIES to one public key or AES-GCM under a topic key.
 */
import { concat } from '@/lib/bytes';
import { randomBytes } from '@/lib/random';

import {
  decryptSymmetric,
  eciesDecrypt,
  eciesEncrypt,
  encryptSymmetric,
  keccak256,
  recoverPublicKey,
  sign,
} from './crypto';

const SIGNATURE_FLAG = 4;
const SIZE_MASK = 3;
const SIGNATURE_LENGTH = 65;
const PADDING_BLOCK = 256;

export type PayloadKey = { recipient: Uint8Array } | { symmetricKey: Uint8Array };

export interface DecodedPayload {
  data: Uint8Array;
  signer: Uint8Array;
}

function sizeField(length: number): Uint8Array {
  const bytes: number[] = [];
  let rest = length;
  do {
    bytes.push(rest & 0xff);
    rest = Math.floor(rest / 256);
  } while (rest > 0);
  return Uint8Array.from(bytes);
}

export function encodePayload(data: Uint8Array, key: PayloadKey, signer: Uint8Array): Uint8Array {
  const size = sizeField(data.length);
  const unpadded = 1 + size.length + data.length + SIGNATURE_LENGTH;
  const padding = randomBytes(PADDING_BLOCK - (unpadded % PADDING_BLOCK));
  const frame = concat([Uint8Array.of(size.length | SIGNATURE_FLAG), size, data, padding]);
  const signed = concat([frame, sign(keccak256(frame), signer)]);
  return 'recipient' in key
    ? eciesEncrypt(key.recipient, signed)
    : encryptSymmetric(key.symmetricKey, signed);
}

export function decodePayload(
  bytes: Uint8Array,
  key: { privateKey: Uint8Array } | { symmetricKey: Uint8Array }
): DecodedPayload | null {
  let frame: Uint8Array;
  try {
    frame =
      'privateKey' in key
        ? eciesDecrypt(key.privateKey, bytes)
        : decryptSymmetric(key.symmetricKey, bytes);
  } catch {
    return null;
  }

  if (frame.length < 1 || !(frame[0] & SIGNATURE_FLAG)) return null;
  const end = frame.length - SIGNATURE_LENGTH;
  if (end <= 1) return null;
  const signer = recoverPublicKey(keccak256(frame.subarray(0, end)), frame.subarray(end));
  if (!signer) return null;

  const sizeLength = frame[0] & SIZE_MASK;
  let size = 0;
  for (let i = sizeLength - 1; i >= 0; i -= 1) size = size * 256 + frame[1 + i];
  const start = 1 + sizeLength;
  if (start > end || start + size > end) return null;
  return { data: frame.subarray(start, start + size), signer };
}

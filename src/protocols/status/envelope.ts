/**
 * The layers between a Waku message and an application message, in the order
 * status-go peels them: payload codec, segments, encryption, data sync (MVDS).
 */
import { bytesToNumberBE } from '@noble/curves/utils';
import { sha256 } from '@noble/hashes/sha2';
import { utf8ToBytes } from '@noble/hashes/utils';

import { concat, toHex, u64le } from '@/lib/bytes';

import {
  compressPublicKey,
  decompressPublicKey,
  decryptSymmetric,
  encryptSymmetric,
  keccak256,
  publicKeyOf,
  randomPrivateKey,
  recoverPublicKey,
  sharedSecret,
  sign,
} from './crypto';
import {
  decodeApplicationMessage,
  decodeMvds,
  decodeProtocolMessage,
  encodeApplicationMessage,
  encodeProtocolMessage,
  type MvdsMessage,
} from './messages';
import { decodePayload, encodePayload } from './payload';
import type { Ratchets } from './ratchet';
import { segment } from './segments';

/** The installation id status-go encrypts to when it knows none of the recipient's devices. */
export const ANY_INSTALLATION = 'none';

export interface Keys {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export interface OpenedEnvelope {
  signer: Uint8Array;
  /** Application messages, with the data-sync record that carried each, if any. */
  records: { body: Uint8Array; sync?: MvdsMessage }[];
  acks: Uint8Array[];
}

export interface ApplicationMessage {
  id: string;
  type: number;
  payload: Uint8Array;
  signer: Uint8Array;
}

export function oneToOneGroupId(a: Uint8Array, b: Uint8Array): Uint8Array {
  const first = bytesToNumberBE(a.subarray(1, 33)) < bytesToNumberBE(b.subarray(1, 33));
  const [low, high] = first ? [a, b] : [b, a];
  return keccak256(compressPublicKey(low), compressPublicKey(high));
}

export function syncMessageId(message: MvdsMessage): Uint8Array {
  return sha256(
    concat([
      utf8ToBytes('MESSAGE_ID'),
      message.groupId,
      u64le(BigInt(message.timestamp)),
      message.body,
    ])
  );
}

export function wrapApplication(
  type: number,
  payload: Uint8Array,
  signer: Keys
): { bytes: Uint8Array; id: string } {
  const bytes = encodeApplicationMessage({
    signature: sign(keccak256(payload), signer.privateKey),
    payload,
    type,
  });
  return { bytes, id: messageIdFor(signer.publicKey, bytes) };
}

export function messageIdFor(author: Uint8Array, applicationBytes: Uint8Array): string {
  return `0x${toHex(keccak256(author, applicationBytes))}`;
}

export function readApplication(bytes: Uint8Array): ApplicationMessage | null {
  try {
    const message = decodeApplicationMessage(bytes);
    if (!message.type || message.signature.length !== 65) return null;
    const signer = recoverPublicKey(keccak256(message.payload), message.signature);
    if (!signer) return null;
    return {
      id: messageIdFor(signer, bytes),
      type: message.type,
      payload: message.payload,
      signer,
    };
  } catch {
    return null;
  }
}

export function syncRecord(
  sender: Uint8Array,
  recipient: Uint8Array,
  body: Uint8Array,
  timestamp: number
): MvdsMessage {
  return { groupId: oneToOneGroupId(sender, recipient), timestamp, body };
}

/** Encrypted for one recipient the way status-go does before it has their devices' bundles. */
export function sealEnvelope(
  sender: Keys,
  installationId: string,
  recipient: Uint8Array,
  plaintext: Uint8Array,
  bundle?: Uint8Array
): Uint8Array[] {
  const ephemeral = randomPrivateKey();
  const protocolMessage = encodeProtocolMessage({
    installationId,
    bundle,
    encrypted: new Map([
      [
        ANY_INSTALLATION,
        {
          dhKey: compressPublicKey(publicKeyOf(ephemeral)),
          payload: encryptSymmetric(sharedSecret(ephemeral, recipient), plaintext),
        },
      ],
    ]),
  });
  return segment(protocolMessage).map((part) =>
    encodePayload(part, { recipient }, sender.privateKey)
  );
}

function decrypt(
  identity: Keys,
  installationId: string,
  signer: Uint8Array,
  data: Uint8Array,
  ratchets?: Ratchets
): Uint8Array | null {
  let message: ReturnType<typeof decodeProtocolMessage>;
  try {
    message = decodeProtocolMessage(data);
  } catch {
    return data;
  }
  if (message.publicMessage) return message.publicMessage;
  if (message.encrypted.size === 0) return data;

  const entry = message.encrypted.get(installationId) ?? message.encrypted.get(ANY_INSTALLATION);
  if (!entry) return null;
  if (entry.ratchet) return ratchets?.decrypt(signer, message.installationId, entry) ?? null;
  if (!entry.dhKey) return null;
  try {
    return decryptSymmetric(
      sharedSecret(identity.privateKey, decompressPublicKey(entry.dhKey)),
      entry.payload
    );
  } catch {
    return null;
  }
}

/** What a sealed Waku payload holds once the payload codec is off, signed by `signer`. */
export function openData(
  identity: Keys,
  installationId: string,
  signer: Uint8Array,
  data: Uint8Array,
  ratchets?: Ratchets
): OpenedEnvelope | null {
  const plaintext = decrypt(identity, installationId, signer, data, ratchets);
  if (!plaintext) return null;

  try {
    const sync = decodeMvds(plaintext);
    if (sync.messages.length + sync.acks.length + sync.others > 0) {
      return {
        signer,
        records: sync.messages.map((message) => ({ body: message.body, sync: message })),
        acks: sync.acks,
      };
    }
  } catch {}
  return { signer, records: [{ body: plaintext }], acks: [] };
}

export function openEnvelope(
  identity: Keys,
  installationId: string,
  payload: Uint8Array,
  ratchets?: Ratchets
): OpenedEnvelope | null {
  const decoded = decodePayload(payload, { privateKey: identity.privateKey });
  return decoded && openData(identity, installationId, decoded.signer, decoded.data, ratchets);
}

/**
 * The receiving half of status-go's X3DH and Double Ratchet, which peers use
 * once they hold a bundle for this device. Replies still go out as DH
 * messages, so this side never sends on a ratchet: it only follows theirs.
 */
import { ctr } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { utf8ToBytes } from '@noble/hashes/utils';

import { concat, fromHex, timingSafeEqual, toHex, u32le } from '@/lib/bytes';

import { compressPublicKey, keccak256, randomPrivateKey, sharedSecret, sign } from './crypto';
import type { Keys } from './envelope';
import { encodeBundle, type WireEncrypted } from './messages';

const ROOT_INFO = utf8ToBytes('rsZUpEuXUqqwXBvSy3EcievAh4cMj6QL');
const MESSAGE_INFO = utf8ToBytes('pcwSByyx2CRdryCffXJwy7xgVZWtW5Sh');
const MAX_SKIP = 1000;
const MAX_KEPT_KEYS = 2000;
const TAG_LENGTH = 32;
const IV_LENGTH = 16;

export interface Chain {
  key: string;
  n: number;
}

export interface RatchetSession {
  /** Their X3DH ephemeral key: a new one means they started over. */
  ephemeral: string;
  root: string;
  receiving: Chain;
  ours: { privateKey: string };
  theirs?: string;
  kept: { dh: string; n: number; key: string }[];
}

export interface SignedPreKey {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

/** A bundle for one installation, signed the way status-go's `SignBundle` does. */
export function signedBundle(
  identity: Keys,
  installationId: string,
  signedPreKey: Uint8Array,
  timestamp: bigint
): Uint8Array {
  const material = concat([
    utf8ToBytes(installationId),
    signedPreKey,
    utf8ToBytes('0'),
    utf8ToBytes(timestamp.toString()),
  ]);
  return encodeBundle({
    identity: compressPublicKey(identity.publicKey),
    installationId,
    signedPreKey,
    signature: sign(keccak256(material), identity.privateKey),
    timestamp,
  });
}

function rootStep(root: Uint8Array, dhOut: Uint8Array): { root: Uint8Array; chain: Uint8Array } {
  const derived = hkdf(sha256, dhOut, root, ROOT_INFO, 96);
  return { root: derived.subarray(0, 32), chain: derived.subarray(32, 64) };
}

function chainStep(chain: Chain): { chain: Chain; messageKey: Uint8Array } {
  const key = fromHex(chain.key);
  return {
    chain: { key: toHex(hmac(sha256, key, Uint8Array.of(15))), n: chain.n + 1 },
    messageKey: hmac(sha256, key, Uint8Array.of(16)),
  };
}

function openWithMessageKey(
  messageKey: Uint8Array,
  data: Uint8Array,
  associated: Uint8Array
): Uint8Array | null {
  if (data.length < IV_LENGTH + TAG_LENGTH) return null;
  const keys = hkdf(sha256, messageKey, new Uint8Array(32), MESSAGE_INFO, 80);
  const ciphertext = data.subarray(0, data.length - TAG_LENGTH);
  const tag = hmac(sha256, keys.subarray(32, 64), concat([associated, ciphertext]));
  if (!timingSafeEqual(tag, data.subarray(data.length - TAG_LENGTH))) return null;
  return ctr(keys.subarray(0, 32), ciphertext.subarray(0, IV_LENGTH)).decrypt(
    ciphertext.subarray(IV_LENGTH)
  );
}

export function passiveX3dh(
  identity: Uint8Array,
  signedPreKey: Uint8Array,
  theirIdentity: Uint8Array,
  theirEphemeral: Uint8Array
): Uint8Array {
  return keccak256(
    sharedSecret(signedPreKey, theirIdentity),
    sharedSecret(identity, theirEphemeral),
    sharedSecret(signedPreKey, theirEphemeral)
  );
}

export function startSession(
  sharedKey: Uint8Array,
  signedPreKey: SignedPreKey,
  ephemeral: Uint8Array
): RatchetSession {
  const key = toHex(sharedKey);
  return {
    ephemeral: toHex(ephemeral),
    root: key,
    receiving: { key, n: 0 },
    ours: { privateKey: toHex(signedPreKey.privateKey) },
    kept: [],
  };
}

function skipTo(
  session: RatchetSession,
  dh: string,
  until: number,
  kept: RatchetSession['kept']
): RatchetSession | null {
  if (until < session.receiving.n || until > session.receiving.n + MAX_SKIP) return null;
  let receiving = session.receiving;
  while (receiving.n < until) {
    const step = chainStep(receiving);
    kept.push({ dh, n: receiving.n, key: toHex(step.messageKey) });
    receiving = step.chain;
  }
  return { ...session, receiving };
}

function turn(session: RatchetSession, theirs: string): RatchetSession {
  const received = rootStep(
    fromHex(session.root),
    sharedSecret(fromHex(session.ours.privateKey), fromHex(theirs))
  );
  const ours = randomPrivateKey();
  const sent = rootStep(received.root, sharedSecret(ours, fromHex(theirs)));
  return {
    ...session,
    theirs,
    root: toHex(sent.root),
    receiving: { key: toHex(received.chain), n: 0 },
    ours: { privateKey: toHex(ours) },
  };
}

/** status-go's `RatchetDecrypt`: the session to keep, or null when the message is not for it. */
export function ratchetDecrypt(
  session: RatchetSession,
  header: { key: Uint8Array; n: number; pn: number },
  ciphertext: Uint8Array
): { plaintext: Uint8Array; session: RatchetSession } | null {
  const dh = toHex(header.key);
  const associated = concat([u32le(header.n), u32le(header.pn), header.key]);

  const known = session.kept.find((entry) => entry.dh === dh && entry.n === header.n);
  if (known) {
    const plaintext = openWithMessageKey(fromHex(known.key), ciphertext, associated);
    return plaintext && { plaintext, session };
  }

  const kept: RatchetSession['kept'] = [];
  let next: RatchetSession | null = session;
  if (dh !== session.theirs) {
    next = skipTo(session, session.theirs ?? '', header.pn, kept);
    if (!next) return null;
    next = turn(next, dh);
  }
  next = skipTo(next, dh, header.n, kept);
  if (!next) return null;

  const step = chainStep(next.receiving);
  const plaintext = openWithMessageKey(step.messageKey, ciphertext, associated);
  if (!plaintext) return null;
  kept.push({ dh, n: header.n, key: toHex(step.messageKey) });
  return {
    plaintext,
    session: {
      ...next,
      receiving: step.chain,
      kept: [...next.kept, ...kept].slice(-MAX_KEPT_KEYS),
    },
  };
}

/** Sessions keyed by the peer device, created from the X3DH header peers keep attaching. */
export class Ratchets {
  private readonly changed = new Set<string>();

  constructor(
    private readonly identity: Keys,
    private readonly signedPreKey: SignedPreKey,
    readonly sessions: Map<string, RatchetSession>
  ) {}

  decrypt(
    theirIdentity: Uint8Array,
    theirInstallation: string,
    entry: WireEncrypted
  ): Uint8Array | null {
    if (!entry.ratchet) return null;
    const ours = compressPublicKey(this.signedPreKey.publicKey);
    if (!timingSafeEqual(entry.ratchet.id, ours)) return null;

    const id = `${toHex(compressPublicKey(theirIdentity))}:${theirInstallation}`;
    let session = this.sessions.get(id);
    const x3dh = entry.x3dh;
    if (x3dh && timingSafeEqual(x3dh.id, ours) && session?.ephemeral !== toHex(x3dh.key)) {
      const sharedKey = passiveX3dh(
        this.identity.privateKey,
        this.signedPreKey.privateKey,
        theirIdentity,
        x3dh.key
      );
      session = startSession(sharedKey, this.signedPreKey, x3dh.key);
    }
    if (!session) return null;

    const opened = ratchetDecrypt(session, entry.ratchet, entry.payload);
    if (!opened) return null;
    if (opened.session !== this.sessions.get(id)) {
      this.sessions.set(id, opened.session);
      this.changed.add(id);
    }
    return opened.plaintext;
  }

  takeChanged(): [string, RatchetSession][] {
    const out = [...this.changed].flatMap((id): [string, RatchetSession][] => {
      const session = this.sessions.get(id);
      return session ? [[id, session]] : [];
    });
    this.changed.clear();
    return out;
  }
}

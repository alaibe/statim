import { fromHex, toHex } from '@/lib/bytes';

import { compressPublicKey, publicKeyOf } from './crypto';
import { openEnvelope, readApplication } from './envelope';
import { decodeChatMessage } from './messages';
import { Ratchets, type RatchetSession, signedBundle } from './ratchet';
import vectors from './testing/status-go-ratchet.json';

const identity = {
  privateKey: fromHex(vectors.identityPrivate),
  publicKey: publicKeyOf(fromHex(vectors.identityPrivate)),
};
const signedPreKey = {
  privateKey: fromHex(vectors.signedPreKeyPrivate),
  publicKey: publicKeyOf(fromHex(vectors.signedPreKeyPrivate)),
};

function textOf(ratchets: Ratchets, index: number): string | null {
  const opened = openEnvelope(
    identity,
    vectors.installation,
    fromHex(vectors.messages[index].wakuPayload),
    ratchets
  );
  if (!opened) return null;
  const message = readApplication(opened.records[0].body)!;
  expect(message.id).toBe(vectors.messages[index].messageId);
  return decodeChatMessage(message.payload).text;
}

describe('bundles', () => {
  it('signs and encodes exactly what status-go does', () => {
    const bundle = signedBundle(
      identity,
      vectors.installation,
      compressPublicKey(signedPreKey.publicKey),
      BigInt(vectors.bundleTimestamp)
    );
    expect(`0x${toHex(bundle)}`).toBe(vectors.bundle);
  });
});

describe('following a status-go ratchet', () => {
  it('decrypts in order, out of order and twice', () => {
    const ratchets = new Ratchets(identity, signedPreKey, new Map());
    expect(vectors.encryptedFor).toEqual([vectors.installation]);
    expect(textOf(ratchets, 0)).toBe('ratchet 1');
    expect(textOf(ratchets, 2)).toBe('ratchet 3');
    expect(textOf(ratchets, 1)).toBe('ratchet 2');
    expect(textOf(ratchets, 2)).toBe('ratchet 3');
    expect(textOf(ratchets, 4)).toBe('ratchet 5');
    expect(textOf(ratchets, 3)).toBe('ratchet 4');
  });

  it('picks up again from saved sessions', () => {
    const first = new Ratchets(identity, signedPreKey, new Map());
    expect(textOf(first, 0)).toBe('ratchet 1');
    const saved = JSON.parse(JSON.stringify(first.takeChanged())) as [string, RatchetSession][];
    expect(saved).toHaveLength(1);

    const later = new Ratchets(identity, signedPreKey, new Map(saved));
    expect(textOf(later, 3)).toBe('ratchet 4');
    expect(textOf(later, 1)).toBe('ratchet 2');
    expect(textOf(later, 0)).toBe('ratchet 1');
  });

  it('cannot open a ratchet meant for another signed pre-key', () => {
    const stranger = {
      privateKey: fromHex(`0x${'11'.repeat(32)}`),
      publicKey: publicKeyOf(fromHex(`0x${'11'.repeat(32)}`)),
    };
    expect(textOf(new Ratchets(identity, stranger, new Map()), 0)).toBeNull();
    expect(
      openEnvelope(identity, vectors.installation, fromHex(vectors.messages[0].wakuPayload))
    ).toBeNull();
  });
});

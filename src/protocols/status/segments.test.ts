import { fromHex, toHex } from '@/lib/bytes';

import { keccak256, publicKeyOf } from './crypto';
import { openData, readApplication } from './envelope';
import { decodeChatMessage } from './messages';
import { decodePayload } from './payload';
import { Reassembly, readSegment, segment } from './segments';
import vectors from './testing/status-go-segments.json';
import keys from './testing/status-go-vectors.json';

const bob = {
  privateKey: fromHex(keys.keys[1].private),
  publicKey: publicKeyOf(fromHex(keys.keys[1].private)),
};

function opened(order: number[]) {
  const reassembly = new Reassembly();
  let whole: { data: Uint8Array; signer: Uint8Array; after: number } | null = null;
  order.forEach((index, step) => {
    const decoded = decodePayload(fromHex(vectors.payloads[index]), {
      privateKey: bob.privateKey,
    })!;
    const part = readSegment(decoded.data);
    const data = part && reassembly.add(decoded.signer, part);
    if (data) whole = { data, signer: decoded.signer, after: step + 1 };
  });
  return whole as { data: Uint8Array; signer: Uint8Array; after: number } | null;
}

describe('segments status-go sends', () => {
  it('come back together once every data segment is in, parity or not', () => {
    const indexes = vectors.payloads.map((_, index) => index);
    const whole = opened(indexes)!;
    expect(whole.after).toBe(vectors.payloads.length - 1);

    const envelope = openData(bob, 'this-device', whole.signer, whole.data)!;
    const message = readApplication(envelope.records[0].body)!;
    expect(message.id).toBe(vectors.messageId);
    const image = decodeChatMessage(message.payload).image!;
    expect(`0x${toHex(keccak256(image.payload))}`).toBe(vectors.imageHash);
    expect([image.width, image.height]).toEqual([640, 480]);
  });

  it('do not care about order, and complete once', () => {
    const shuffled = [8, 3, 0, 9, 5, 1, 7, 2, 6, 4, 4];
    expect(opened(shuffled)!.after).toBe(10);
  });

  it('stay incomplete without a data segment, since parity is not used', () => {
    expect(opened([0, 1, 2, 3, 4, 5, 6, 7, 9])).toBeNull();
  });
});

describe('segments this side sends', () => {
  it('split only what is too big and reassemble to the same bytes', () => {
    const small = Uint8Array.from({ length: 100 }, (_, i) => i);
    expect(segment(small, 100)).toEqual([small]);

    const big = Uint8Array.from({ length: 1000 }, (_, i) => (i * 31) % 256);
    const parts = segment(big, 300).map((part) => readSegment(part)!);
    expect(parts.map((part) => part.index)).toEqual([0, 1, 2, 3]);
    const reassembly = new Reassembly();
    const signer = bob.publicKey;
    expect(parts.slice(0, 3).map((part) => reassembly.add(signer, part))).toEqual([
      null,
      null,
      null,
    ]);
    expect(reassembly.add(signer, parts[3])).toEqual(big);
    expect(reassembly.add(signer, parts[3])).toBeNull();
  });

  it('refuse a set whose hash does not match', () => {
    const big = Uint8Array.from({ length: 700 }, (_, i) => i % 256);
    const parts = segment(big, 300).map((part) => readSegment(part)!);
    parts[1] = { ...parts[1], payload: parts[1].payload.map((byte) => byte ^ 1) };
    const reassembly = new Reassembly();
    const results = parts.map((part) => reassembly.add(bob.publicKey, part));
    expect(results.at(-1)).toBeNull();
  });
});

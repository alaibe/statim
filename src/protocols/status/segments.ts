/**
 * status-go splits a payload too big for one Waku message into segments, each
 * sealed on its own, and puts them back together before decrypting. Parity
 * segments only help when a data segment is lost, so this side ignores them.
 */
import { concat, timingSafeEqual, toHex } from '@/lib/bytes';

import { keccak256 } from './crypto';
import { ProtoFields, ProtoWriter } from './proto';

/** Small enough that a sealed segment fits nwaku's default 150 KiB limit. */
export const SEGMENT_SIZE = 100_000;
const PENDING_LIMIT = 64;
const COMPLETED_LIMIT = 1_000;

export interface Segment {
  hash: Uint8Array;
  index: number;
  count: number;
  payload: Uint8Array;
  originalLength: number;
}

export function segment(data: Uint8Array, size = SEGMENT_SIZE): Uint8Array[] {
  if (data.length <= size) return [data];
  const hash = keccak256(data);
  const count = Math.ceil(data.length / size);
  return Array.from({ length: count }, (_, index) =>
    new ProtoWriter()
      .bytes(1, hash)
      .uint(2, index)
      .uint(3, count)
      .bytes(4, data.subarray(index * size, (index + 1) * size))
      .uint(7, data.length)
      .finish()
  );
}

/** A data segment, or null for anything else, parity segments included. */
export function readSegment(data: Uint8Array): Segment | null {
  try {
    const fields = ProtoFields.parse(data);
    const hash = fields.bytes(1);
    const index = fields.number(2);
    const count = fields.number(3);
    if (hash.length !== 32 || count < 2 || index >= count) return null;
    return { hash, index, count, payload: fields.bytes(4), originalLength: fields.number(7) };
  } catch {
    return null;
  }
}

export class Reassembly {
  private readonly pending = new Map<string, Map<number, Uint8Array>>();
  private readonly completed = new Set<string>();

  /** The whole payload once the last of its data segments arrives. */
  add(signer: Uint8Array, part: Segment): Uint8Array | null {
    const key = `${toHex(part.hash)}:${toHex(signer)}`;
    if (this.completed.has(key)) return null;
    let parts = this.pending.get(key);
    if (!parts) {
      parts = new Map();
      this.pending.set(key, parts);
      if (this.pending.size > PENDING_LIMIT) this.pending.delete(this.pending.keys().next().value!);
    }
    parts.set(part.index, part.payload);
    if (parts.size < part.count) return null;

    this.pending.delete(key);
    const joined = concat(Array.from({ length: part.count }, (_, index) => parts.get(index)!));
    const whole = part.originalLength > 0 ? joined.subarray(0, part.originalLength) : joined;
    if (!timingSafeEqual(keccak256(whole), part.hash)) return null;
    this.completed.add(key);
    if (this.completed.size > COMPLETED_LIMIT) {
      this.completed.delete(this.completed.values().next().value!);
    }
    return whole;
  }
}

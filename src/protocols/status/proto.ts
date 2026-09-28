import { utf8ToBytes } from '@noble/hashes/utils';

import { concat } from '@/lib/bytes';

const VARINT = 0;
const FIXED64 = 1;
const LENGTH = 2;
const FIXED32 = 5;

export class ProtoWriter {
  private readonly parts: Uint8Array[] = [];

  uint(field: number, value: number | bigint | undefined): this {
    if (!value) return this;
    this.tag(field, VARINT);
    this.varint(BigInt(value));
    return this;
  }

  bool(field: number, value: boolean | undefined): this {
    return value ? this.uint(field, 1) : this;
  }

  bytes(field: number, value: Uint8Array | undefined): this {
    return value?.length ? this.length(field, value) : this;
  }

  string(field: number, value: string | undefined): this {
    return value ? this.length(field, utf8ToBytes(value)) : this;
  }

  message(field: number, value: Uint8Array | undefined): this {
    return value ? this.length(field, value) : this;
  }

  repeatedBytes(field: number, values: readonly Uint8Array[] | undefined): this {
    for (const value of values ?? []) this.length(field, value);
    return this;
  }

  repeatedString(field: number, values: readonly string[] | undefined): this {
    for (const value of values ?? []) this.length(field, utf8ToBytes(value));
    return this;
  }

  finish(): Uint8Array {
    return concat(this.parts);
  }

  private length(field: number, value: Uint8Array): this {
    this.tag(field, LENGTH);
    this.varint(BigInt(value.length));
    this.parts.push(value);
    return this;
  }

  private tag(field: number, wire: number): void {
    this.varint(BigInt(field * 8 + wire));
  }

  private varint(value: bigint): void {
    const out: number[] = [];
    let rest = BigInt.asUintN(64, value);
    while (rest >= 0x80n) {
      out.push(Number(rest & 0x7fn) | 0x80);
      rest >>= 7n;
    }
    out.push(Number(rest));
    this.parts.push(Uint8Array.from(out));
  }
}

interface Field {
  wire: number;
  varint: bigint;
  bytes: Uint8Array;
}

const decoder = new TextDecoder();

export class ProtoFields {
  private constructor(private readonly byNumber: Map<number, Field[]>) {}

  static parse(bytes: Uint8Array): ProtoFields {
    const byNumber = new Map<number, Field[]>();
    let at = 0;
    const readVarint = (): bigint => {
      let result = 0n;
      for (let shift = 0n; ; shift += 7n) {
        if (at >= bytes.length || shift > 63n) throw new Error('Malformed protobuf varint');
        const byte = bytes[at++];
        result |= BigInt(byte & 0x7f) << shift;
        if (byte < 0x80) return BigInt.asUintN(64, result);
      }
    };
    const take = (length: number): Uint8Array => {
      if (length < 0 || at + length > bytes.length) throw new Error('Truncated protobuf field');
      const out = bytes.subarray(at, at + length);
      at += length;
      return out;
    };

    while (at < bytes.length) {
      const key = readVarint();
      const field = Number(key >> 3n);
      const wire = Number(key & 7n);
      if (field === 0) throw new Error('Protobuf field number 0');
      let parsed: Field;
      switch (wire) {
        case VARINT:
          parsed = { wire, varint: readVarint(), bytes: new Uint8Array() };
          break;
        case LENGTH:
          parsed = { wire, varint: 0n, bytes: take(Number(readVarint())) };
          break;
        case FIXED64:
          parsed = { wire, varint: 0n, bytes: take(8) };
          break;
        case FIXED32:
          parsed = { wire, varint: 0n, bytes: take(4) };
          break;
        default:
          throw new Error(`Unsupported protobuf wire type ${wire}`);
      }
      const list = byNumber.get(field);
      if (list) list.push(parsed);
      else byNumber.set(field, [parsed]);
    }
    return new ProtoFields(byNumber);
  }

  has(field: number): boolean {
    return this.byNumber.has(field);
  }

  uint(field: number): bigint {
    return this.last(field, VARINT)?.varint ?? 0n;
  }

  number(field: number): number {
    return Number(this.uint(field));
  }

  bool(field: number): boolean {
    return this.uint(field) !== 0n;
  }

  bytes(field: number): Uint8Array {
    return this.last(field, LENGTH)?.bytes ?? new Uint8Array();
  }

  string(field: number): string {
    return decoder.decode(this.bytes(field));
  }

  message(field: number): ProtoFields | undefined {
    const found = this.last(field, LENGTH);
    return found && ProtoFields.parse(found.bytes);
  }

  repeatedBytes(field: number): Uint8Array[] {
    return this.all(field, LENGTH).map((entry) => entry.bytes);
  }

  repeatedStrings(field: number): string[] {
    return this.repeatedBytes(field).map((bytes) => decoder.decode(bytes));
  }

  repeatedMessages(field: number): ProtoFields[] {
    return this.repeatedBytes(field).map((bytes) => ProtoFields.parse(bytes));
  }

  private all(field: number, wire: number): Field[] {
    return (this.byNumber.get(field) ?? []).filter((entry) => entry.wire === wire);
  }

  private last(field: number, wire: number): Field | undefined {
    const matching = this.all(field, wire);
    return matching[matching.length - 1];
  }
}

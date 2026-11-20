import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";

import { concat } from "@/lib/bytes";

const SYSTEM_PROGRAM = new Uint8Array(32);

const TRANSFER = 2;

export function encodeLength(value: number): Uint8Array {
  if (value < 0 || value > 0xffff) throw new Error(`Length ${value} is out of range`);
  const out: number[] = [];
  let rest = value;
  for (;;) {
    if (rest < 0x80) {
      out.push(rest);
      break;
    }
    out.push((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return Uint8Array.from(out);
}

export interface TransferParams {
  from: Uint8Array;
  to: Uint8Array;
  lamports: bigint;
  blockhash: string;
}

export function transferData(lamports: bigint): Uint8Array {
  if (lamports < 0n || lamports > 0xffffffffffffffffn) {
    throw new Error("Amount is out of range");
  }
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, TRANSFER, true);
  view.setBigUint64(4, lamports, true);
  return data;
}

export function buildTransferMessage({ from, to, lamports, blockhash }: TransferParams): Uint8Array {
  if (from.length !== 32 || to.length !== 32) throw new Error("Keys must be 32 bytes");

  const recent = base58.decode(blockhash);
  if (recent.length !== 32) throw new Error("Blockhash must decode to 32 bytes");

  const keys = [from, to, SYSTEM_PROGRAM];

  return concat([
    Uint8Array.from([1, 0, 1]),
    encodeLength(keys.length),
    ...keys,
    recent,
    encodeLength(1),
    Uint8Array.from([2]),
    encodeLength(2),
    Uint8Array.from([0, 1]),
    ...(() => {
      const data = transferData(lamports);
      return [encodeLength(data.length), data];
    })(),
  ]);
}

export function signTransaction(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  const signature = ed25519.sign(message, privateKey);
  return concat([encodeLength(1), signature, message]);
}

function decodeLength(bytes: Uint8Array, at: number): [value: number, next: number] {
  let value = 0;
  for (let i = 0; i < 3; i++) {
    const byte = bytes[at + i];
    value |= (byte & 0x7f) << (7 * i);
    if ((byte & 0x80) === 0) return [value, at + i + 1];
  }
  throw new Error("Length is out of range");
}

const V0 = 0x80;

/**
 * Signs a v0 transaction someone else assembled, after checking that it has one
 * signer, that signer is `key` and so pays its fees, and `program` is among the
 * programs it calls (a program is never loaded from a lookup table).
 */
export function signPrepared(
  transaction: Uint8Array,
  key: { publicKey: Uint8Array; privateKey: Uint8Array },
  program: string,
): Uint8Array {
  const [signatures, start] = decodeLength(transaction, 0);
  const message = transaction.slice(start + 64 * signatures);
  if (message[0] !== V0) throw new Error("That is not a v0 Solana transaction.");
  if (signatures !== 1 || message[1] !== 1) throw new Error("That transaction needs someone else to sign it too.");

  const [count, keysAt] = decodeLength(message, 4);
  const keys = Array.from({ length: count }, (_, i) => message.slice(keysAt + 32 * i, keysAt + 32 * (i + 1)));
  if (base58.encode(keys[0]) !== base58.encode(key.publicKey)) {
    throw new Error("That transaction is paid for by another address.");
  }
  if (!keys.some((k) => base58.encode(k) === program)) {
    throw new Error("That transaction does not call the program it should.");
  }

  return concat([encodeLength(1), ed25519.sign(message, key.privateKey), message]);
}

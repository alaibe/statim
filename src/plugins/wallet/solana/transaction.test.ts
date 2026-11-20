import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";

import { buildTransferMessage, encodeLength, signPrepared, signTransaction, transferData } from "./transaction";

const FROM = new Uint8Array(32).fill(1);
const TO = new Uint8Array(32).fill(2);
const BLOCKHASH = base58.encode(new Uint8Array(32).fill(3));

describe("encodeLength", () => {
  it("is one byte below 128", () => {
    expect([...encodeLength(0)]).toEqual([0]);
    expect([...encodeLength(127)]).toEqual([127]);
  });

  it("continues into a second byte at 128", () => {
    // Seven bits per byte, high bit set to continue.
    expect([...encodeLength(128)]).toEqual([0x80, 0x01]);
    expect([...encodeLength(0x1234)]).toEqual([0xb4, 0x24]);
  });

  it("refuses a length the format cannot carry", () => {
    expect(() => encodeLength(0x10000)).toThrow(/out of range/);
  });
});

describe("transferData", () => {
  it("is the discriminant then the amount, both little-endian", () => {
    const data = transferData(1n);

    expect(data).toHaveLength(12);
    // u32 = 2 (Transfer), then u64 = 1.
    expect([...data]).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("carries a full lamport range without floating point", () => {
    const data = transferData(1_000_000_000n);
    expect(new DataView(data.buffer).getBigUint64(4, true)).toBe(1_000_000_000n);
  });

  it("refuses a negative amount", () => {
    expect(() => transferData(-1n)).toThrow(/out of range/);
  });
});

describe("buildTransferMessage", () => {
  const message = buildTransferMessage({
    from: FROM,
    to: TO,
    lamports: 1_000_000_000n,
    blockhash: BLOCKHASH,
  });

  it("declares one signer and one read-only account", () => {
    // [numRequiredSignatures, numReadonlySigned, numReadonlyUnsigned]: the sender signs and pays,
    // the recipient is written to, and the System Program is read-only.
    expect([...message.slice(0, 3)]).toEqual([1, 0, 1]);
  });

  it("orders the accounts signer, writable, program", () => {
    expect([...message.slice(4, 36)]).toEqual([...FROM]);
    expect([...message.slice(36, 68)]).toEqual([...TO]);
    // The System Program's address is 32 zero bytes.
    expect([...message.slice(68, 100)]).toEqual([...new Uint8Array(32)]);
  });

  it("carries the blockhash immediately after the keys", () => {
    expect([...message.slice(100, 132)]).toEqual([...new Uint8Array(32).fill(3)]);
  });

  it("points the instruction at the program and the two accounts", () => {
    // count=1, programIdIndex=2, accounts=[0,1], dataLen=12
    expect([...message.slice(132, 139)]).toEqual([1, 2, 2, 0, 1, 12, 2]);
  });

  it("refuses a blockhash that is not 32 bytes", () => {
    expect(() =>
      buildTransferMessage({
        from: FROM,
        to: TO,
        lamports: 1n,
        blockhash: base58.encode(FROM.slice(0, 8)),
      }),
    ).toThrow(/32 bytes/);
  });
});

describe("signTransaction", () => {
  const priv = new Uint8Array(32).fill(7);
  const message = buildTransferMessage({
    from: ed25519.getPublicKey(priv),
    to: TO,
    lamports: 5n,
    blockhash: BLOCKHASH,
  });
  const signed = signTransaction(message, priv);

  it("prefixes one signature and keeps the message intact", () => {
    expect(signed[0]).toBe(1);
    expect(signed).toHaveLength(1 + 64 + message.length);
    expect([...signed.slice(65)]).toEqual([...message]);
  });

  it("produces a signature the sender’s public key verifies", () => {
    expect(ed25519.verify(signed.slice(1, 65), message, ed25519.getPublicKey(priv))).toBe(true);
  });
});

describe("signPrepared", () => {
  /** A SOL to USDC swap Jupiter assembled on 2026-11-20 for a public example address. */
  const JUPITER_SWAP =
    "AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAQAGDAuCTCqj" +
    "aZSF8mxm/xoStaH3VVnrhI150KK+4ItGNoTHFUndeQng/oU3d114NWrTmtixL163dcjo1FjBGYi3lyobi/oKacYXjcC+HMjXXxjC" +
    "c1fq7YFs9qjkbeNVTYK0BDdmdeCl/KjoU+xBCPHY5j97ANu62VkAp9XI3wpAJN4WQ7K7VLSpbM0nstQrHQnRF+zzpGqF4x0l1s3O" +
    "uQPlKnhYOWeWAxXI7DYA1SyrqdvRxL70tycJK2CxPu0DV91luwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwZGb+Uh" +
    "FzL/7K26csOb57yM5bvF9xJrLEObOkAAAAAEedVb8jHAbu50xW7OaBUH/bGy3qP0jlECsc2iVrwTjwbd9uHXZaGT2cvhRs7reawc" +
    "tIXtX1s3kTqM9YV+/wCpjJclj04kifG7PRApFI4NgwtaE5na/xCEBI572Nvp+Fm0P/on9df2SnTAmx8pWHneSwmrNt/J3VFLMhqn" +
    "s4zl6COezN3bHkTsKw9OeP3X2imCjw74ZyJcuuK2Nb/1XSJtBwcABQJFMgEABwAJA84lAAAAAAAACgYAAQAPBgkBAQYCAAEMAgAA" +
    "AICWmAAAAAAACQEBAREIFQkAAQQIEQgLCBAJAA0BDgQMAgUDEiTlF8uXeuOtKgEAAAARAWQAAYCWmAAAAAAAawcLAAAAAAAyAAAJ" +
    "AwEAAAEJAXllEnP2pS43C4mFrbVuxJZ44MClBwYrnwSSXZQRuFVQA22QaQQSAGps";
  const JUPITER = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
  const PAYER_AT = 1 + 64 + 1 + 3 + 1;

  const privateKey = new Uint8Array(32).fill(7);
  const key = { privateKey, publicKey: ed25519.getPublicKey(privateKey) };

  function paidBy(publicKey: Uint8Array): Uint8Array {
    const bytes = Uint8Array.from(atob(JUPITER_SWAP), (c) => c.charCodeAt(0));
    bytes.set(publicKey, PAYER_AT);
    return bytes;
  }

  it("fills the one signature slot with a signature of the message", () => {
    const unsigned = paidBy(key.publicKey);
    const signed = signPrepared(unsigned, key, JUPITER);
    const message = unsigned.slice(65);
    expect(signed.length).toBe(unsigned.length);
    expect([...signed.slice(65)]).toEqual([...message]);
    expect(ed25519.verify(signed.slice(1, 65), message, key.publicKey)).toBe(true);
  });

  it("refuses a transaction another address pays for", () => {
    expect(() => signPrepared(paidBy(new Uint8Array(32).fill(9)), key, JUPITER)).toThrow(/another address/);
  });

  it("refuses one that does not call the program the quote came from", () => {
    expect(() => signPrepared(paidBy(key.publicKey), key, base58.encode(new Uint8Array(32).fill(5)))).toThrow(
      /program/,
    );
  });

  it("refuses a legacy transaction", () => {
    const legacy = paidBy(key.publicKey);
    legacy[65] = 1;
    expect(() => signPrepared(legacy, key, JUPITER)).toThrow(/v0/);
  });
});

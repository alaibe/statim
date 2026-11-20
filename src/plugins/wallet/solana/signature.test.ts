import { findSignature, type ParsedTransaction, summarise } from "./signature";

const SIGNATURE = "2BKHWNa2cmd26FUy2VkeAcgbJ7bMvqUokwz9DVKDTAt6vG7u1oacDWM6BnTmnyMFiG4UNNU5xr2jKDUH79vZ4RK";
const FROM = "mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN";
const TO = "11111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const transaction = (
  instructions: ParsedTransaction["transaction"]["message"]["instructions"],
  err: unknown = null,
) => ({
  meta: { err },
  transaction: { message: { instructions } },
});

describe("findSignature", () => {
  it("finds a signature inside a sentence", () => {
    expect(findSignature(`paid, ${SIGNATURE} should land soon`)).toBe(SIGNATURE);
  });

  it("ignores an address, which is half as long", () => {
    expect(findSignature(`send it to ${FROM}`)).toBeNull();
  });

  it("ignores a base58 run that is not 64 bytes", () => {
    expect(findSignature("1".repeat(87))).toBeNull();
  });
});

describe("summarise", () => {
  it("reads a SOL transfer after the compute budget instruction", () => {
    const sent = transaction([
      { program: "compute-budget", parsed: undefined },
      {
        program: "system",
        parsed: { type: "transfer", info: { source: FROM, destination: TO, lamports: 250_000_000 } },
      },
    ]);
    expect(summarise(sent)).toEqual({ status: "success", amount: "0.25 SOL", from: FROM, to: TO });
  });

  it("names a listed token by its symbol", () => {
    const sent = transaction([
      {
        program: "spl-token",
        parsed: {
          type: "transferChecked",
          info: { authority: FROM, mint: USDC, tokenAmount: { uiAmountString: "12.5" } },
        },
      },
    ]);
    expect(summarise(sent)).toEqual({ status: "success", amount: "12.5 USDC", from: FROM });
  });

  it("says a transaction failed, with nothing it recognises", () => {
    expect(summarise(transaction([], { InstructionError: [0, "Custom"] }))).toEqual({ status: "failed" });
  });
});

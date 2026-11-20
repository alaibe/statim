import { type Address, encodeFunctionData, erc20Abi, type Hex, parseEther } from "viem";

import { publicClientFor } from "./chains";
import { findTransactionHash, locateTransaction } from "./transactions";

jest.mock("./chains", () => ({
  ...jest.requireActual("./chains"),
  publicClientFor: jest.fn(),
}));

const HASH = "0x" + "a1b2c3d4".repeat(8);

describe("findTransactionHash", () => {
  it("finds a hash on its own", () => {
    expect(findTransactionHash(HASH)).toBe(HASH);
  });

  it("finds one inside a sentence", () => {
    expect(findTransactionHash(`sent it — ${HASH} — should be quick`)).toBe(HASH);
  });

  it("ignores an address, which is half the length", () => {
    expect(findTransactionHash("0x1234567890123456789012345678901234567890")).toBeNull();
  });

  it("ignores a longer hex run", () => {
    expect(findTransactionHash("0x" + "a".repeat(70))).toBeNull();
  });

  it("ignores ordinary text", () => {
    expect(findTransactionHash("paid you back, check your wallet")).toBeNull();
  });

  it("accepts either case", () => {
    const upper = "0x" + "AB".repeat(32);
    expect(findTransactionHash(upper)).toBe(upper);
  });
});

describe("locateTransaction", () => {
  const FROM = "0x0000000000000000000000000000000000000001" as Address;
  const ALICE = "0x0000000000000000000000000000000000000002" as Address;
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address;

  function onMainnet(transaction: { to: Address; value: bigint; input: Hex }, hash: Hex) {
    jest.mocked(publicClientFor).mockReturnValue({
      getTransaction: async () => ({ from: FROM, ...transaction }),
      getTransactionReceipt: async () => ({ status: "success", blockNumber: 1n }),
    } as unknown as ReturnType<typeof publicClientFor>);
    return locateTransaction(hash, [1]);
  }

  it("shows a coin payment in the chain's coin", async () => {
    const summary = await onMainnet({ to: ALICE, value: parseEther("0.5"), input: "0x" }, `0x${"01".repeat(32)}`);
    expect(summary).toMatchObject({ amount: "0.5 ETH", to: ALICE, status: "success" });
  });

  it("shows a token transfer in the token, sent to whoever the call names", async () => {
    const input = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [ALICE, 25_000_000n] });
    const summary = await onMainnet({ to: USDC, value: 0n, input }, `0x${"02".repeat(32)}`);
    expect(summary).toMatchObject({ amount: "25 USDC", to: ALICE });
  });

  it("names any other contract call without an amount", async () => {
    const input = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [ALICE, 1n] });
    const summary = await onMainnet({ to: USDC, value: 0n, input }, `0x${"03".repeat(32)}`);
    expect(summary).toMatchObject({ amount: null, to: USDC });
  });
});

import { from1e8, readMemo, to1e8 } from "./thorchain";

describe("THORChain units", () => {
  it("scales 18 and 6 decimal amounts to 1e8 and back, dropping what 1e8 cannot hold", () => {
    expect(to1e8(1_234_567_891_234_567_891n, 18)).toBe(123_456_789n);
    expect(from1e8(123_456_789n, 18)).toBe(1_234_567_890_000_000_000n);
    expect(to1e8(100_000_000n, 6)).toBe(10_000_000_000n);
    expect(from1e8(10_000_000_000n, 6)).toBe(100_000_000n);
  });
});

describe("readMemo", () => {
  it("reads a short swap memo", () => {
    expect(readMemo("=:e:0x000000000000000000000000000000000000dEaD:34953867")).toEqual({
      asset: "ETH.ETH",
      destination: "0x000000000000000000000000000000000000dEaD",
      limit: 34_953_867n,
    });
  });

  it("reads the limit before a streaming interval and quantity", () => {
    expect(readMemo("=:ETH.USDC:0xabc:61160948442/1/0")).toMatchObject({ asset: "ETH.USDC", limit: 61_160_948_442n });
  });

  it("is not a swap without a destination or a limit", () => {
    expect(readMemo("=:b:bc1qxyz")).toBeNull();
    expect(readMemo("+:BTC.BTC:bc1qxyz:1")).toBeNull();
  });
});

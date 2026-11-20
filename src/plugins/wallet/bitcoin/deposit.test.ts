import { fetchFeeRates, fetchUtxos } from "./api";
import { planDeposit } from "./deposit";
import { opReturn, outputSize, scriptPubKey, virtualSize } from "./transaction";

jest.mock("./api", () => ({ ...jest.requireActual("./api"), fetchUtxos: jest.fn(), fetchFeeRates: jest.fn() }));
jest.mock("./config", () => ({ apiBase: () => "https://mempool.test/api" }));

const ME = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";
const VAULT = "bc1qdr0ssmsgglm66nx2k2sfhz8mxy7rmvzu6qr9s3";
const MEMO = "=:e:0x000000000000000000000000000000000000dEaD:34953867";

beforeEach(() => {
  jest.mocked(fetchUtxos).mockResolvedValue([{ txid: "ab".repeat(32), vout: 0, value: 2_000_000n }]);
  jest.mocked(fetchFeeRates).mockResolvedValue({ fast: 9, medium: 5, slow: 2 });
});

describe("opReturn", () => {
  it("pushes a short memo with one length byte and a long one with OP_PUSHDATA1", () => {
    expect([...opReturn(new Uint8Array(3))]).toEqual([0x6a, 3, 0, 0, 0]);
    expect([...opReturn(new Uint8Array(80)).slice(0, 3)]).toEqual([0x6a, 0x4c, 80]);
  });

  it("refuses more than 80 bytes, which nodes would not relay", () => {
    expect(() => opReturn(new Uint8Array(81))).toThrow(/80 bytes/);
  });
});

describe("planDeposit", () => {
  it("pays the vault first, change back to the sender second, and the memo last", async () => {
    const planned = await planDeposit(ME, { to: VAULT, sats: 1_000_000n, memo: MEMO, minFeeRate: 3 });
    if ("error" in planned) throw new Error(planned.error);
    const memo = opReturn(new TextEncoder().encode(MEMO));

    expect(planned.outputs.map((o) => o.value)).toEqual([1_000_000n, planned.plan.change, 0n]);
    expect(planned.outputs[0].script).toEqual(scriptPubKey(VAULT));
    expect(planned.outputs[1].script).toEqual(scriptPubKey(ME));
    expect(planned.outputs[2].script).toEqual(memo);
    expect(planned.plan.fee).toBe(BigInt(virtualSize(1, 2, outputSize(memo)) * 5));
  });

  it("pays at least the rate the vault asks for", async () => {
    const planned = await planDeposit(ME, { to: VAULT, sats: 1_000_000n, memo: MEMO, minFeeRate: 12 });
    if ("error" in planned) throw new Error(planned.error);
    expect(planned.feeRate).toBe(12);
  });

  it("says when the coins do not cover the amount and its fee", async () => {
    expect(await planDeposit(ME, { to: VAULT, sats: 1_999_999n, memo: MEMO, minFeeRate: 3 })).toEqual({
      error: expect.stringMatching(/Not enough confirmed BTC/),
    });
  });
});

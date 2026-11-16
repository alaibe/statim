import { LcxError, lcxSwap } from "./lcx";

const me = "0x0000000000000000000000000000000000000002" as const;
const NATIVE = "0x0000000000000000000000000000000000000000" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const ROUTER = "0x0000000000b1ae06c96aB73FF4360d7AeAaB56F0" as const;

const params = {
  chainId: 8453,
  tokenIn: NATIVE,
  tokenOut: USDC,
  amountIn: 10n ** 16n,
  recipient: me,
  slippageBps: 50,
};

const quoted = {
  quote: {
    quoteId: "q_1",
    input: { amount: "10000000000000000", token: NATIVE },
    output: { amount: "18226954", minimumAmount: "18135819", token: USDC },
    spender: ROUTER,
  },
};

const built = (to: string = ROUTER) => ({
  swap: { chainId: 8453, to, data: "0xfc54261d", value: "10000000000000000" },
  minAmountOut: "18135819",
  routerDeployed: true,
});

function stub(...answers: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  global.fetch = jest.fn(async (url, init) => {
    calls.push({ url: String(url), init: init as RequestInit });
    const { status, body } = answers[Math.min(calls.length - 1, answers.length - 1)];
    return { ok: status < 400, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return calls;
}

const failure = (status: number, code: string, message: string) => ({
  status,
  body: { success: false, code, error: code, message },
});

describe("the LCX Liberty DEX client", () => {
  it("quotes in base units, then builds that quote for the recipient, with the key as a bearer token", async () => {
    const calls = stub(
      { status: 200, body: { success: true, data: quoted } },
      { status: 200, body: { data: built() } },
    );

    const swap = await lcxSwap(params, "lbk_key");

    expect(calls.map((call) => call.url)).toEqual([
      "https://swap-api.lcx.com/v1/quote",
      "https://swap-api.lcx.com/v1/build",
    ]);
    expect(calls[0].init.headers).toEqual({ Authorization: "Bearer lbk_key", "Content-Type": "application/json" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      chainId: 8453,
      tokenIn: NATIVE,
      tokenOut: USDC,
      amountIn: "10000000000000000",
      slippageBps: 50,
    });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ quoteId: "q_1", recipient: me, slippageBps: 50 });
    expect(swap.build.minAmountOut).toBe("18135819");
  });

  it("refuses a build that calls another contract than the spender it quoted", async () => {
    stub(
      { status: 200, body: { data: quoted } },
      { status: 200, body: { data: built("0x0000000000000000000000000000000000000bad") } },
    );

    await expect(lcxSwap(params, "lbk_key")).rejects.toThrow(/does not match its quote/);
  });

  it("says when the key was rejected", async () => {
    stub(failure(401, "INVALID_API_KEY", "Unknown key"));

    await expect(lcxSwap(params, "bad")).rejects.toThrow(/key was rejected/);
  });

  it("explains a missing route without the API's internal wording", async () => {
    stub(failure(400, "no_route", "No route for this pair"));

    const attempt = lcxSwap(params, "lbk_key");
    await expect(attempt).rejects.toBeInstanceOf(LcxError);
    await expect(attempt).rejects.toThrow("LCX Liberty DEX found no route for this trade.");
  });

  it("passes other messages through", async () => {
    stub({ status: 200, body: { data: quoted } }, failure(410, "QUOTE_EXPIRED", "Quote expired, refresh and retry"));

    await expect(lcxSwap(params, "lbk_key")).rejects.toThrow("Quote expired, refresh and retry");
  });
});

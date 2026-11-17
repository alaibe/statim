import { type Address, encodeFunctionData, type Hex } from "viem";

import { LCX_ROUTER_ABI, LcxError, lcxSwap } from "./lcx";

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

const later = () => BigInt(Math.floor(Date.now() / 1000) + 300);

interface Call {
  tokenIn: Address;
  tokenOut: Address;
  totalIn: bigint;
  minAmountOut: bigint;
  recipient: Address;
  deadline: bigint;
}

const call = (overrides: Partial<Call> = {}): Call => ({
  tokenIn: NATIVE,
  tokenOut: USDC,
  totalIn: 10n ** 16n,
  minAmountOut: 18135819n,
  recipient: me,
  deadline: later(),
  ...overrides,
});

const swapSplit = (overrides: Partial<Call> = {}): Hex => {
  const c = call(overrides);
  return encodeFunctionData({
    abi: LCX_ROUTER_ABI,
    functionName: "swapSplit",
    args: [c.tokenIn, c.tokenOut, c.totalIn, c.minAmountOut, c.recipient, c.deadline, []],
  });
};

const built = (
  swap: Partial<{ to: string; value: string; chainId: number; data: Hex }> = {},
  minAmountOut = "18135819",
) => ({
  swap: { chainId: 8453, to: ROUTER, data: swapSplit(), value: "10000000000000000", ...swap },
  minAmountOut,
  routerDeployed: true,
});

const quotedFor = (input: Partial<{ amount: string; token: string }>) => ({
  quote: { ...quoted.quote, input: { ...quoted.quote.input, ...input } },
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

  it.each([
    ["calls a contract other than the chain's published router", quoted, built({ to: `0x${"0b".repeat(20)}` })],
    ["prices another amount than the one asked", quotedFor({ amount: "20000000000000000" }), built()],
    ["sells another token than the one asked", quotedFor({ token: USDC }), built()],
    ["sends more of the coin than the amount sold", quoted, built({ value: "20000000000000000" })],
    ["builds a lower floor than it quoted", quoted, built({}, "1")],
    ["is for another chain", quoted, built({ chainId: 10 })],
  ])("refuses an answer that %s", async (_, quote, build) => {
    stub({ status: 200, body: { data: quote } }, { status: 200, body: { data: build } });

    await expect(lcxSwap(params, "lbk_key")).rejects.toThrow(/does not match the request/);
  });

  it("refuses a chain it has no published router for", async () => {
    stub({ status: 200, body: { data: quoted } }, { status: 200, body: { data: built({ chainId: 11155111 }) } });

    await expect(lcxSwap({ ...params, chainId: 11155111 }, "lbk_key")).rejects.toThrow(/does not match the request/);
  });

  it("expects no coin to be sent along when a token is sold", async () => {
    const usdcIn = { ...params, tokenIn: USDC, tokenOut: NATIVE, amountIn: 5_000_000n };
    const quote = {
      quote: {
        ...quoted.quote,
        input: { amount: "5000000", token: USDC },
        output: { ...quoted.quote.output, token: NATIVE },
      },
    };

    const data = swapSplit({ tokenIn: USDC, tokenOut: NATIVE, totalIn: 5_000_000n });

    stub({ status: 200, body: { data: quote } }, { status: 200, body: { data: built({ value: "0", data }) } });
    await expect(lcxSwap(usdcIn, "lbk_key")).resolves.toEqual(expect.objectContaining({ quote: quote.quote }));

    stub({ status: 200, body: { data: quote } }, { status: 200, body: { data: built({ value: "5000000", data }) } });
    await expect(lcxSwap(usdcIn, "lbk_key")).rejects.toThrow(/does not match the request/);
  });

  it.each([
    ["sends the output to another address", swapSplit({ recipient: `0x${"0c".repeat(20)}` })],
    ["enforces a lower floor than it quoted", swapSplit({ minAmountOut: 1n })],
    ["spends more than the amount sold", swapSplit({ totalIn: 2n * 10n ** 16n })],
    ["buys another token", swapSplit({ tokenOut: `0x${"0d".repeat(20)}` })],
    ["has already expired", swapSplit({ deadline: 1n })],
    ["is not a swap the router exposes", "0xdeadbeef" as Hex],
  ])("refuses calldata that %s", async (_, data) => {
    stub({ status: 200, body: { data: quoted } }, { status: 200, body: { data: built({ data }) } });

    await expect(lcxSwap(params, "lbk_key")).rejects.toThrow(/does not match the request/);
  });

  it("accepts a route split with a market maker's pool", async () => {
    const c = call();
    const data = encodeFunctionData({
      abi: LCX_ROUTER_ABI,
      functionName: "swapSplitWithPropAMMSplit",
      args: [
        { ...c, integrator: NATIVE },
        [],
        [],
        { venue: `0x${"0e".repeat(20)}`, venueIn: 10n ** 15n, venueMinOut: 1n },
      ],
    });
    stub({ status: 200, body: { data: quoted } }, { status: 200, body: { data: built({ data }) } });

    await expect(lcxSwap(params, "lbk_key")).resolves.toEqual(expect.objectContaining({ quote: quoted.quote }));
  });

  it("refuses a market-maker leg that calls anything but Bebop", async () => {
    const c = call();
    const maker = (target: Address, amountIn = 10n ** 15n) =>
      encodeFunctionData({
        abi: LCX_ROUTER_ABI,
        functionName: "makerSwap",
        args: [
          {
            tokenIn: c.tokenIn,
            tokenOut: c.tokenOut,
            amountIn: c.totalIn,
            minAmountOut: c.minAmountOut,
            recipient: c.recipient,
            deadline: c.deadline,
          },
          [],
          { target, spender: target, amountIn, minOut: 1n, data: "0x" },
          [],
        ],
      });

    stub(
      { status: 200, body: { data: quoted } },
      { status: 200, body: { data: built({ data: maker("0xbeb0009aca35087ce7ccf11637e24dd1aad3bf2a") }) } },
    );
    await expect(lcxSwap(params, "lbk_key")).resolves.toBeDefined();

    stub(
      { status: 200, body: { data: quoted } },
      { status: 200, body: { data: built({ data: maker(`0x${"0f".repeat(20)}`) }) } },
    );
    await expect(lcxSwap(params, "lbk_key")).rejects.toThrow(/does not match the request/);

    stub(
      { status: 200, body: { data: quoted } },
      { status: 200, body: { data: built({ data: maker(`0x${"0f".repeat(20)}`, 0n) }) } },
    );
    await expect(lcxSwap(params, "lbk_key")).rejects.toThrow(/does not match the request/);

    stub({ status: 200, body: { data: quoted } }, { status: 200, body: { data: built({ data: maker(NATIVE, 0n) }) } });
    await expect(lcxSwap(params, "lbk_key")).resolves.toBeDefined();
  });

  it("refuses a route that names an integrator to take a fee", async () => {
    const data = encodeFunctionData({
      abi: LCX_ROUTER_ABI,
      functionName: "swapSplitWithFee",
      args: [{ ...call(), integrator: `0x${"1a".repeat(20)}` }, []],
    });
    stub({ status: 200, body: { data: quoted } }, { status: 200, body: { data: built({ data }) } });

    await expect(lcxSwap(params, "lbk_key")).rejects.toThrow(/does not match the request/);
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

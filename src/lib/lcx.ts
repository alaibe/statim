import { type Address, type Hex, zeroAddress } from "viem";

import { HttpError } from "@/core/errors";

const BASE = "https://swap-api.lcx.com/v1";

const ROUTER = "0x0000000000b1ae06c96aB73FF4360d7AeAaB56F0";
const ROUTER_2 = "0x0000000000654902B6Ed6cC240cc81CB4c4a3dff";

/** The router LCX Liberty DEX publishes for each chain; a build for any other contract is refused. */
const ROUTERS: Record<number, Address> = {
  1: ROUTER,
  10: ROUTER,
  8453: ROUTER,
  42161: ROUTER,
  137: ROUTER_2,
};

export class LcxError extends HttpError {
  constructor(
    status: number,
    message: string,
    readonly code?: string,
  ) {
    super(status, message);
    this.name = "LcxError";
  }
}

export interface LcxQuote {
  quoteId: string;
  input: { amount: string; token: Address };
  output: { amount: string; minimumAmount: string; token: Address };
  usdValueIn?: number | null;
  usdValueOut?: number | null;
  /** Swap gas only, in wei; null when the chain's gas price is unknown. */
  gasEstimateWei?: string | null;
  gasFeeUSD?: number | null;
  /** The router to approve; null on a chain without one. */
  spender: Address | null;
}

export interface LcxBuild {
  swap: { chainId: number; to: Address; data: Hex; value: string };
  /** The floor from the quote that was shown, enforced by the router. */
  minAmountOut: string;
  routerDeployed: boolean;
}

export interface LcxSwap {
  quote: LcxQuote;
  build: LcxBuild;
}

const NO_ROUTE = new Set(["no_route", "insufficient_liquidity"]);

async function post<T>(path: string, body: unknown, key: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const answer = (await response.json().catch(() => null)) as {
    data?: T;
    code?: string;
    message?: string;
  } | null;

  if (response.ok && answer?.data) return answer.data;

  if (response.status === 401 || response.status === 403) {
    throw new LcxError(
      response.status,
      "That LCX Liberty DEX key was rejected. Check it under Settings → Trades.",
      answer?.code,
    );
  }
  if (response.status === 429) {
    throw new LcxError(429, "LCX Liberty DEX is limiting quotes for this key. Wait a while.", answer?.code);
  }
  if (answer?.code && NO_ROUTE.has(answer.code)) {
    throw new LcxError(response.status, "LCX Liberty DEX found no route for this trade.", answer.code);
  }
  throw new LcxError(
    response.status,
    answer?.message ?? `LCX Liberty DEX could not be reached (HTTP ${response.status}).`,
    answer?.code,
  );
}

interface LcxSwapParams {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  /** In the token's base units. */
  amountIn: bigint;
  /** Where the bought token lands. */
  recipient: Address;
  slippageBps: number;
}

const same = (a: string | null | undefined, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

function wei(value: string): bigint | null {
  try {
    return BigInt(value || "0");
  } catch {
    return null;
  }
}

/** Whether the answer is for exactly this request, so nothing else reaches the review card or the wallet. */
function answersRequest(params: LcxSwapParams, { quote, build }: LcxSwap): boolean {
  const router = ROUTERS[params.chainId];
  const value = wei(build.swap.value);
  return (
    router !== undefined &&
    build.routerDeployed &&
    build.swap.chainId === params.chainId &&
    same(quote.spender, router) &&
    same(build.swap.to, router) &&
    quote.input.amount === params.amountIn.toString() &&
    same(quote.input.token, params.tokenIn) &&
    same(quote.output.token, params.tokenOut) &&
    build.minAmountOut === quote.output.minimumAmount &&
    value === (same(params.tokenIn, zeroAddress) ? params.amountIn : 0n)
  );
}

/**
 * Quotes, then builds the transaction for that quote. Both answers are
 * refused unless they match the request: chain, router, tokens, amount, the
 * coin sent along and the floor.
 */
export async function lcxSwap(params: LcxSwapParams, key: string): Promise<LcxSwap> {
  const { quote } = await post<{ quote: LcxQuote }>(
    "/quote",
    {
      chainId: params.chainId,
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      amountIn: params.amountIn.toString(),
      slippageBps: params.slippageBps,
    },
    key,
  );
  const build = await post<LcxBuild>(
    "/build",
    { quoteId: quote.quoteId, recipient: params.recipient, slippageBps: params.slippageBps },
    key,
  );

  if (!answersRequest(params, { quote, build })) {
    throw new LcxError(502, "LCX Liberty DEX returned a trade that does not match the request, so it was not used.");
  }
  return { quote, build };
}

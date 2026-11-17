import { type Address, decodeFunctionData, type Hex, zeroAddress } from "viem";

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

const LEGS = {
  name: "legs",
  type: "tuple[]",
  components: [
    { name: "amountIn", type: "uint256" },
    {
      name: "hops",
      type: "tuple[]",
      components: [
        { name: "family", type: "uint8" },
        { name: "pool", type: "address" },
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "aux", type: "uint256" },
      ],
    },
  ],
} as const;

const FEE_SWAP_ARGS = {
  name: "a",
  type: "tuple",
  components: [
    { name: "tokenIn", type: "address" },
    { name: "tokenOut", type: "address" },
    { name: "totalIn", type: "uint256" },
    { name: "minAmountOut", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "deadline", type: "uint256" },
    { name: "integrator", type: "address" },
  ],
} as const;

const AMOUNT_OUT = [{ name: "amountOut", type: "uint256" }] as const;

/** Every entrypoint the router exposes for a swap; calldata for anything else is refused. */
export const LCX_ROUTER_ABI = [
  {
    name: "swapSplit",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "totalIn", type: "uint256" },
      { name: "minAmountOut", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "deadline", type: "uint256" },
      LEGS,
    ],
    outputs: AMOUNT_OUT,
  },
  {
    name: "swapSplitWithFee",
    type: "function",
    stateMutability: "payable",
    inputs: [FEE_SWAP_ARGS, LEGS],
    outputs: AMOUNT_OUT,
  },
  {
    name: "swapSplitViaPropAMM",
    type: "function",
    stateMutability: "payable",
    inputs: [FEE_SWAP_ARGS, LEGS, { name: "venue", type: "address" }, { name: "coreNetOut", type: "uint256" }],
    outputs: AMOUNT_OUT,
  },
  {
    name: "swapSplitWithPropAMMSplit",
    type: "function",
    stateMutability: "payable",
    inputs: [
      FEE_SWAP_ARGS,
      { ...LEGS, name: "splitLegs" },
      { ...LEGS, name: "fullLegs" },
      {
        name: "s",
        type: "tuple",
        components: [
          { name: "venue", type: "address" },
          { name: "venueIn", type: "uint256" },
          { name: "venueMinOut", type: "uint256" },
        ],
      },
    ],
    outputs: AMOUNT_OUT,
  },
  {
    name: "makerSwap",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "a",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minAmountOut", type: "uint256" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { ...LEGS, name: "poolLegs" },
      {
        name: "m",
        type: "tuple",
        components: [
          { name: "target", type: "address" },
          { name: "spender", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "minOut", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
      { ...LEGS, name: "fallbackLegs" },
    ],
    outputs: AMOUNT_OUT,
  },
] as const;

/** The only contracts a market-maker leg may call: Bebop's RFQ router and settlement. */
const BEBOP = ["0xbeb0009aca35087ce7ccf11637e24dd1aad3bf2a", "0xbbbbbbb520d69a9775e85b458c58c648259fad5f"];

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

interface SwapFields {
  tokenIn: string;
  tokenOut: string;
  totalIn: bigint;
  minAmountOut: bigint;
  recipient: string;
  deadline: bigint;
}

/** What the router will actually do, read from the calldata; null when it is not a swap the router exposes. */
function decodedSwap(data: Hex): SwapFields | null {
  let decoded: ReturnType<typeof decodeFunctionData<typeof LCX_ROUTER_ABI>>;
  try {
    decoded = decodeFunctionData({ abi: LCX_ROUTER_ABI, data });
  } catch {
    return null;
  }
  if (decoded.functionName === "swapSplit") {
    const [tokenIn, tokenOut, totalIn, minAmountOut, recipient, deadline] = decoded.args;
    return { tokenIn, tokenOut, totalIn, minAmountOut, recipient, deadline };
  }
  if (decoded.functionName === "makerSwap") {
    const [a, , m] = decoded.args;
    const bebop = BEBOP.some((b) => same(m.target, b)) && BEBOP.some((b) => same(m.spender, b));
    const none = m.amountIn === 0n && same(m.target, zeroAddress) && same(m.spender, zeroAddress) && m.data === "0x";
    if (!(bebop || none) || m.amountIn > a.amountIn) return null;
    return { ...a, totalIn: a.amountIn };
  }
  const [a] = decoded.args;
  // No integrator is asked for, so none may take a fee. A prop-AMM venue needs no
  // allowlist: the router reverts unless the recipient gets at least minAmountOut.
  return same(a.integrator, zeroAddress) ? a : null;
}

/** Whether the answer is for exactly this request, so nothing else reaches the review card or the wallet. */
function answersRequest(params: LcxSwapParams, { quote, build }: LcxSwap): boolean {
  const router = ROUTERS[params.chainId];
  const value = wei(build.swap.value);
  const call = decodedSwap(build.swap.data);
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
    value === (same(params.tokenIn, zeroAddress) ? params.amountIn : 0n) &&
    call !== null &&
    same(call.recipient, params.recipient) &&
    call.totalIn === params.amountIn &&
    same(call.tokenIn, params.tokenIn) &&
    same(call.tokenOut, params.tokenOut) &&
    call.minAmountOut >= BigInt(quote.output.minimumAmount) &&
    call.deadline > BigInt(Math.floor(Date.now() / 1000))
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

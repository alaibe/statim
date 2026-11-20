import { HttpError } from "@/core/errors";

const BASE = "https://api.jup.ag/swap/v1";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

/** The program every Jupiter swap goes through. */
export const JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

/** The most a swap may add as a priority fee: 0.001 SOL. */
const MAX_PRIORITY_LAMPORTS = 1_000_000;

export class JupiterError extends HttpError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "JupiterError";
  }
}

export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  /** The least the swap pays out once slippage is counted; the program enforces it. */
  otherAmountThreshold: string;
  priceImpactPct: string;
  routePlan: { swapInfo: { label?: string } }[];
}

export interface JupiterSwap {
  swapTransaction: string;
  lastValidBlockHeight: number;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, init);
  if (response.ok) return (await response.json()) as T;

  if (response.status === 429) {
    throw new JupiterError(429, "Jupiter is limiting quotes from this device. Wait a minute and try again.");
  }
  const body = (await response.json().catch(() => null)) as { error?: string; errorCode?: string } | null;
  if (body?.errorCode === "NO_ROUTES_FOUND" || body?.errorCode === "TOKEN_NOT_TRADABLE") {
    throw new JupiterError(
      response.status,
      "Jupiter found no route for this trade. A larger amount or a different pair may have one.",
    );
  }
  throw new JupiterError(response.status, body?.error ?? `Jupiter could not be reached (HTTP ${response.status}).`);
}

export function jupiterQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
}): Promise<JupiterQuote> {
  const query = new URLSearchParams({
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    amount: String(params.amount),
    slippageBps: String(params.slippageBps),
    restrictIntermediateTokens: "true",
  });
  return call(`/quote?${query}`);
}

export function jupiterSwap(quote: JupiterQuote, userPublicKey: string): Promise<JupiterSwap> {
  return call("/swap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: { priorityLevel: "medium", maxLamports: MAX_PRIORITY_LAMPORTS },
      },
    }),
  });
}

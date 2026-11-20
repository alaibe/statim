import { HttpError } from "@/core/errors";
import { fetchJson, type JsonApi } from "./json-api";

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
  routePlan: { swapInfo: { label?: string } }[];
}

export interface JupiterSwap {
  swapTransaction: string;
}

const NO_ROUTE = new Set(["NO_ROUTES_FOUND", "TOKEN_NOT_TRADABLE"]);

interface JupiterBody {
  error?: string;
  errorCode?: string;
}

const JUPITER: JsonApi<JupiterBody> = {
  name: "Jupiter",
  limited: "Jupiter is limiting quotes from this device. Wait a minute and try again.",
  explain: (_status, body) =>
    body?.errorCode && NO_ROUTE.has(body.errorCode)
      ? "Jupiter found no route for this trade. A larger amount or a different pair may have one."
      : body?.error,
  error: (status, message) => new JupiterError(status, message),
};

const call = <T>(path: string, init?: RequestInit) => fetchJson<T, JupiterBody>(`${BASE}${path}`, init, JUPITER);

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

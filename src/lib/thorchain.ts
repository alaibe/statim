import { HttpError } from "@/core/errors";
import { fetchJson, type JsonApi } from "./json-api";

const BASE = "https://gateway.liquify.com/chain/thorchain_api/thorchain";

const HEADERS = { "x-client-id": "statim" };

export const THORCHAIN_ROUTER_ABI = [
  {
    name: "depositWithExpiry",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "vault", type: "address" },
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "string" },
      { name: "expiration", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export class ThorchainError extends HttpError {
  constructor(status: number, message: string) {
    super(status, message);
    this.name = "ThorchainError";
  }
}

/** Every amount is in units of 1e8, whatever the asset's own decimals. */
export interface ThorQuote {
  inbound_address: string;
  router?: string;
  memo: string;
  expected_amount_out: string;
  fees: { total: string };
  expiry: number;
  recommended_min_amount_in?: string;
  recommended_gas_rate?: string;
  total_swap_seconds?: number;
}

interface ThorInbound {
  chain: string;
  address: string;
  router?: string;
  halted: boolean;
  chain_trading_paused: boolean;
  global_trading_paused: boolean;
}

interface Stage {
  completed?: boolean;
}

interface ThorStatus {
  stages?: {
    inbound_observed?: Stage;
    outbound_signed?: Stage;
  };
  planned_out_txs?: { refund?: boolean }[];
  out_txs?: { id: string; chain: string; coins: { asset: string; amount: string }[] }[];
}

const REFUSALS: [RegExp, string][] = [
  [/pool does not exist/, "THORChain has no pool for one of these assets."],
  [/trading is halted|trading paused/, "THORChain has paused trading on this chain for now. Try again later."],
  [/dust threshold|less than .*min/, "That amount is too small for THORChain to swap."],
];

const THORCHAIN: JsonApi<{ message?: string }> = {
  name: "THORChain",
  limited: "THORChain is limiting quotes from this device. Wait a few seconds and try again.",
  explain: (_status, body) => {
    const message = body?.message;
    if (!message) return undefined;
    return REFUSALS.find(([pattern]) => pattern.test(message))?.[1] ?? `THORChain: ${message}`;
  },
  error: (status, message) => new ThorchainError(status, message),
};

const get = <T>(path: string) => fetchJson<T, { message?: string }>(`${BASE}${path}`, { headers: HEADERS }, THORCHAIN);

export function thorQuote(params: {
  fromAsset: string;
  toAsset: string;
  amount: bigint;
  destination: string;
  toleranceBps: number;
}): Promise<ThorQuote> {
  const query = new URLSearchParams({
    from_asset: params.fromAsset,
    to_asset: params.toAsset,
    amount: String(params.amount),
    destination: params.destination,
    liquidity_tolerance_bps: String(params.toleranceBps),
  });
  return get(`/quote/swap?${query}`);
}

export async function thorInbound(chain: string): Promise<ThorInbound | null> {
  const all = await get<ThorInbound[]>("/inbound_addresses");
  return all.find((entry) => entry.chain === chain) ?? null;
}

export function thorStatus(hash: string): Promise<ThorStatus> {
  return get(`/tx/status/${hash.replace(/^0x/i, "")}`);
}

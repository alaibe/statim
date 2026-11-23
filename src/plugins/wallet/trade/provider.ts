import type { Address, Hex } from "viem";

import type { CommandInvocation, PluginContext } from "@/core/plugins/types";
import type { WidgetRow, WidgetTone } from "@/design/widgets";
import type { PermitPlan, PermitTargets } from "@/lib/evm/permit";
import type { DepositPlan } from "../bitcoin/deposit";
import type { ChainStrategy } from "../chains/strategy";

export interface TradeKeys {
  lifi: string | null;
  lcx: string | null;
}

export interface TradeAsset {
  /** An EVM contract, a Solana mint, or BTC. */
  address: string;
  symbol: string;
  decimals: number;
}

export interface TradeRequest {
  from: ChainStrategy;
  to: ChainStrategy;
  sell: TradeAsset;
  buy: TradeAsset;
  amount: bigint;
  sender: string;
  recipient: string;
  slippage: number;
  keys: TradeKeys;
}

export interface Cost {
  amount: bigint;
  token: TradeAsset;
  usd?: number;
}

export interface EvmPayment {
  kind: "evm";
  to: Address;
  data: Hex;
  value?: bigint;
  gas?: bigint;
  spender: Address;
  skipApproval?: boolean;
}

/** A base64 transaction the provider assembles once the trade is confirmed, which must call `program`. */
export interface SolanaPayment {
  kind: "solana";
  program: string;
  transaction(): Promise<string>;
}

export interface BitcoinPayment {
  kind: "bitcoin";
  deposit: DepositPlan;
}

export interface TradeStatus {
  label: string;
  tone: WidgetTone;
  caption?: string;
  rows: WidgetRow[];
  links: { label: string; url: string }[];
  /** Still under way, so asking again may say more. */
  open: boolean;
}

/** A reason any provider gives for not quoting, shown as it is. */
export class TradeRefusal extends Error {}

export interface TradeQuote {
  provider: TradeProvider;
  route: string;
  sold: bigint;
  receive: bigint;
  receiveMin: bigint;
  /** 0 when the provider does not say. */
  seconds: number;
  gas?: Cost[];
  fees?: Cost[];
  usd?: { from?: number; to?: number };
  payment: EvmPayment | SolanaPayment | BitcoinPayment;
}

export interface TradeProvider {
  name: string;
  site: string;
  covers(route: { from: ChainStrategy; to: ChainStrategy; keys: TradeKeys }): boolean;
  quote(request: TradeRequest): Promise<TradeQuote>;
  refusal(error: unknown): string | null;
  permitTargets?(chainId: number): Promise<{ permit2: Address; proxy: Address } | null>;
  tracker?(hash: string): { label: string; url: string };
  /** How a trade between two chains is doing, by the hash of what left the first. */
  status?(hash: string, route: { from: ChainStrategy; to: ChainStrategy; keys: TradeKeys }): Promise<TradeStatus>;
}

export interface Approval {
  needsApproval: boolean;
  permit?: PermitPlan;
  targets?: PermitTargets;
}

export interface Trade extends Approval {
  quote: TradeQuote;
  other?: TradeQuote;
  fromToken: TradeAsset;
  toToken: TradeAsset;
  recipient: string;
  sendsAway: boolean;
}

export interface Sent {
  approval?: Hex;
  hash: string;
  state: "done" | "pending" | "failed";
}

export interface TradeLeg {
  receivable(chain: ChainStrategy): { symbol: string; address: string }[];
  token(chain: ChainStrategy, given: string, keys: TradeKeys): Promise<TradeAsset | { error: string }>;
  held(chain: ChainStrategy, token: TradeAsset, owner: string): Promise<bigint>;
  /** Why the account cannot also pay the fees `quote` needs, if it cannot. */
  shortfall(request: TradeRequest, held: bigint, quote: TradeQuote): Promise<string | null>;
  approval?(context: PluginContext, request: TradeRequest, quote: TradeQuote): Promise<Approval>;
  send(
    context: PluginContext,
    chain: ChainStrategy,
    trade: Trade,
    respond: CommandInvocation["respond"],
  ): Promise<Sent>;
}

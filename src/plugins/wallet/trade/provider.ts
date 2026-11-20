import type { Address, Hex } from "viem";

import type { WidgetRow, WidgetTone } from "@/design/widgets";
import type { Deposit } from "../bitcoin/deposit";
import type { ChainStrategy } from "../chains/strategy";

export type TradeChain = ChainStrategy;

export interface TradeKeys {
  lifi: string | null;
  lcx: string | null;
}

export interface TradeAsset {
  /** An EVM contract or a Solana mint. */
  address: string;
  symbol: string;
  decimals: number;
}

export interface TradeRequest {
  from: TradeChain;
  to: TradeChain;
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

/** A transaction on the sell chain, after an approval of `spender` when it holds too little allowance. */
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

/** A Bitcoin payment to a vault, with a memo saying what to do with it. */
export interface BitcoinPayment {
  kind: "bitcoin";
  deposit: Deposit;
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
  id: string;
  name: string;
  site: string;
  covers(route: { from: TradeChain; to: TradeChain; keys: TradeKeys }): boolean;
  quote(request: TradeRequest): Promise<TradeQuote>;
  /** The provider's own words for an answer that is not a quote, such as no route. */
  refusal(error: unknown): string | null;
  /** Lets a token go by signature through Permit2 instead of an approval per trade. */
  permitTargets?(chainId: number): Promise<{ permit2: Address; proxy: Address } | null>;
  tracker?(hash: string): { label: string; url: string };
  /** How a trade between two chains is doing, by the hash of what left the first. */
  status?(hash: string, route: { from: TradeChain; to: TradeChain; keys: TradeKeys }): Promise<TradeStatus>;
}

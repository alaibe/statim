import type { Address, Chain, Hex } from "viem";

import type { ChainStrategy } from "../chains/strategy";

export type TradeChain = ChainStrategy & { evm: Chain };

export interface TradeKeys {
  lifi: string | null;
  lcx: string | null;
}

export interface TradeAsset {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface TradeRequest {
  from: TradeChain;
  to: TradeChain;
  sell: TradeAsset;
  buy: TradeAsset;
  amount: bigint;
  sender: Address;
  recipient: Address;
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
  payment: EvmPayment;
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
  tracker?(hash: Hex): { label: string; url: string };
}

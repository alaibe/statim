import type { PluginContext } from "@/core/plugins/types";
import { fetchUtxos } from "../bitcoin/api";
import { apiBase } from "../bitcoin/config";
import { sendDeposit } from "../bitcoin/deposit";
import type { BitcoinPayment, TradeAsset } from "./provider";

export const BTC: TradeAsset = { address: "BTC", symbol: "BTC", decimals: 8 };

export function resolveBitcoinToken(given: string): TradeAsset | { error: string } {
  return ["native", "btc"].includes(given.toLowerCase()) ? BTC : { error: "On Bitcoin there is only BTC to trade." };
}

export async function bitcoinHeld(owner: string): Promise<bigint> {
  const utxos = await fetchUtxos(owner, apiBase());
  return utxos.reduce((sum, utxo) => sum + utxo.value, 0n);
}

export const sendBitcoinTrade = (context: PluginContext, { deposit }: BitcoinPayment) => sendDeposit(context, deposit);

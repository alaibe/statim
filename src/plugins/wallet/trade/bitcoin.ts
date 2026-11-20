import { fetchUtxos } from "../bitcoin/api";
import { apiBase } from "../bitcoin/config";
import { sendDeposit } from "../bitcoin/deposit";
import type { TradeAsset, TradeLeg } from "./provider";

export const BTC: TradeAsset = { address: "BTC", symbol: "BTC", decimals: 8 };

export const bitcoinLeg: TradeLeg = {
  receivable: () => [{ symbol: "BTC", address: "native" }],
  token: async (_chain, given) =>
    ["native", "btc"].includes(given.toLowerCase()) ? BTC : { error: "On Bitcoin there is only BTC to trade." },
  held: async (_chain, _token, owner) =>
    (await fetchUtxos(owner, apiBase())).reduce((sum, utxo) => sum + utxo.value, 0n),
  shortfall: async () => null,

  async send(context, _chain, { quote: { payment } }) {
    if (payment.kind !== "bitcoin") throw new Error("A Bitcoin trade needs a Bitcoin deposit.");
    return { hash: await sendDeposit(context, payment.deposit), state: "done" };
  },
};

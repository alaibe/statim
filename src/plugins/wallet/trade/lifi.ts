import type { Address } from "viem";
import { LifiError, type LifiToken, lifiExplorerUrl, lifiPermitTargets, lifiQuote } from "@/lib/lifi";

import type { Cost, TradeProvider } from "./provider";

const costs = (list: { amount: string; amountUSD?: string; token: LifiToken }[] | undefined): Cost[] | undefined =>
  list?.map(({ amount, amountUSD, token }) => ({
    amount: BigInt(amount),
    token,
    usd: amountUSD === undefined ? undefined : Number(amountUSD),
  }));

const dollars = (value: string | undefined) => (value ? Number(value) : undefined);

export const lifi: TradeProvider = {
  id: "lifi",
  name: "LI.FI",
  site: "https://li.fi",
  covers: ({ from, to }) => from.evm !== undefined && to.evm !== undefined,

  async quote({ from, to, sell, buy, amount, sender, recipient, slippage, keys }) {
    const quote = await lifiQuote(
      {
        fromChain: from.evm!.id,
        toChain: to.evm!.id,
        fromToken: sell.address as Address,
        toToken: buy.address as Address,
        fromAddress: sender as Address,
        toAddress: recipient as Address,
        fromAmount: amount,
        slippage,
      },
      keys.lifi,
    );
    const { estimate, transactionRequest: tx } = quote;
    return {
      provider: lifi,
      route: quote.toolDetails.name,
      sold: BigInt(quote.action.fromAmount),
      receive: BigInt(estimate.toAmount),
      receiveMin: BigInt(estimate.toAmountMin),
      seconds: estimate.executionDuration,
      gas: costs(estimate.gasCosts),
      fees: costs(estimate.feeCosts),
      usd: { from: dollars(estimate.fromAmountUSD), to: dollars(estimate.toAmountUSD) },
      payment: {
        kind: "evm",
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : undefined,
        gas: tx.gasLimit ? BigInt(tx.gasLimit) : undefined,
        spender: estimate.approvalAddress,
        skipApproval: estimate.skipApproval,
      },
    };
  },

  refusal: (error) => (error instanceof LifiError ? error.message : null),
  permitTargets: lifiPermitTargets,
  tracker: (hash) => ({ label: "Track on LI.FI", url: lifiExplorerUrl(hash) }),
};

import { JUPITER_PROGRAM, JupiterError, jupiterQuote, jupiterSwap } from "@/lib/jupiter";

import { type TradeProvider, TradeRefusal } from "./provider";

export const jupiter: TradeProvider = {
  name: "Jupiter",
  site: "https://jup.ag",
  covers: ({ from, to }) => from.id === "solana" && to.id === "solana",

  async quote({ sell, buy, amount, sender, recipient, slippage }) {
    if (recipient !== sender) {
      throw new TradeRefusal("A Jupiter swap lands in your own address, so leave Recipient empty.");
    }
    const quote = await jupiterQuote({
      inputMint: sell.address,
      outputMint: buy.address,
      amount,
      slippageBps: Math.round(slippage * 10_000),
    });
    if (quote.inputMint !== sell.address || quote.outputMint !== buy.address || BigInt(quote.inAmount) !== amount) {
      throw new TradeRefusal("Jupiter answered for a different trade, so it was not used.");
    }
    const hops = [...new Set(quote.routePlan.flatMap((step) => (step.swapInfo.label ? [step.swapInfo.label] : [])))];
    return {
      provider: jupiter,
      route: hops.length ? `Jupiter: ${hops.join(", ")}` : "Jupiter",
      sold: amount,
      receive: BigInt(quote.outAmount),
      receiveMin: BigInt(quote.otherAmountThreshold),
      seconds: 0,
      payment: {
        kind: "solana",
        program: JUPITER_PROGRAM,
        transaction: async () => (await jupiterSwap(quote, sender)).swapTransaction,
      },
    };
  },

  refusal: (error) => (error instanceof JupiterError ? error.message : null),
};

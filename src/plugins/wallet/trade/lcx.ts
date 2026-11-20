import { type Address, zeroAddress } from "viem";

import { LcxError, lcxSwap } from "@/lib/lcx";

import type { TradeProvider } from "./provider";

export const lcx: TradeProvider = {
  id: "lcx",
  name: "LCX Liberty DEX",
  site: "https://dex.lcx.com",
  covers: ({ from, to, keys }) => keys.lcx !== null && from.evm !== undefined && from.id === to.id,

  async quote({ from, sell, buy, amount, recipient, slippage, keys }) {
    const { quote, build } = await lcxSwap(
      {
        chainId: from.evm!.id,
        tokenIn: sell.address as Address,
        tokenOut: buy.address as Address,
        amountIn: amount,
        recipient: recipient as Address,
        slippageBps: Math.round(slippage * 10_000),
      },
      keys.lcx!,
    );
    const { symbol, decimals } = from.evm!.nativeCurrency;
    const native = { address: zeroAddress, symbol, decimals };
    return {
      provider: lcx,
      route: lcx.name,
      sold: BigInt(quote.input.amount),
      receive: BigInt(quote.output.amount),
      receiveMin: BigInt(build.minAmountOut),
      seconds: 0,
      gas: quote.gasEstimateWei
        ? [{ amount: BigInt(quote.gasEstimateWei), token: native, usd: quote.gasFeeUSD ?? undefined }]
        : undefined,
      usd: { from: quote.usdValueIn ?? undefined, to: quote.usdValueOut ?? undefined },
      payment: {
        kind: "evm",
        to: build.swap.to,
        data: build.swap.data,
        value: BigInt(build.swap.value || "0"),
        spender: build.swap.to,
      },
    };
  },

  refusal: (error) => (error instanceof LcxError ? error.message : null),
};

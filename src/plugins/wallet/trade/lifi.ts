import type { Address } from "viem";
import type { WidgetRow, WidgetTone } from "@/design/widgets";
import {
  LifiError,
  type LifiStatus,
  type LifiStatusValue,
  type LifiToken,
  lifiExplorerUrl,
  lifiPermitTargets,
  lifiQuote,
  lifiStatus,
} from "@/lib/lifi";
import { chainStrategies } from "../chains/strategy";
import { amountOf } from "./evm";
import type { Cost, TradeProvider } from "./provider";

const STATUS_LABEL: Record<LifiStatusValue, { label: string; tone: WidgetTone }> = {
  DONE: { label: "Done", tone: "success" },
  PENDING: { label: "In progress", tone: "brand" },
  FAILED: { label: "Failed", tone: "danger" },
  NOT_FOUND: { label: "Not seen yet", tone: "warning" },
  INVALID: { label: "Not recognised", tone: "danger" },
};

const chainName = (chainId: number) => chainStrategies().find((c) => c.evm?.id === chainId)?.name ?? `chain ${chainId}`;

const leg = (name: string, l: LifiStatus["sending"]): WidgetRow[] =>
  l?.token && l.amount
    ? [{ label: name, value: `${amountOf(l.amount, l.token)} ${l.token.symbol} on ${chainName(l.chainId)}` }]
    : [];

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

  async status(hash, { from, to, keys }) {
    const status = await lifiStatus({ txHash: hash, fromChain: from.evm!.id, toChain: to.evm!.id }, keys.lifi);
    const { receiving } = status;
    return {
      ...(STATUS_LABEL[status.status] ?? STATUS_LABEL.INVALID),
      caption: status.substatusMessage,
      rows: [...leg("Sent", status.sending), ...leg("Received", receiving)],
      links: [
        ...(receiving?.txLink ? [{ label: `View on ${chainName(receiving.chainId)}`, url: receiving.txLink }] : []),
        { label: "Track on LI.FI", url: status.lifiExplorerLink ?? lifiExplorerUrl(hash) },
      ],
      open: status.status === "PENDING" || status.status === "NOT_FOUND",
    };
  },
};

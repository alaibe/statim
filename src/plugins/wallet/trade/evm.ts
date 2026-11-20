import { type Address, encodeFunctionData, erc20Abi, formatUnits, type Hex } from "viem";

import type { CommandInvocation, PluginContext } from "@/core/plugins/types";
import { W } from "@/design/widgets";
import { publicClientFor, trimDecimals } from "@/lib/evm/chains";
import { permittedCall, planPermit } from "@/lib/evm/permit";
import { popularTokens } from "@/lib/evm/token-list";
import { walletClientFor } from "@/lib/evm/wallet";
import { LIFI_NATIVE, lifiToken } from "@/lib/lifi";
import type { ChainStrategy } from "../chains/strategy";
import type { Approval, EvmPayment, Trade, TradeAsset, TradeLeg, TradeQuote, TradeRequest } from "./provider";

type Respond = CommandInvocation["respond"];

export const amountOf = (units: string | bigint, token: Pick<TradeAsset, "decimals">) =>
  trimDecimals(formatUnits(BigInt(units), token.decimals));

async function resolveToken(
  chain: ChainStrategy,
  given: string,
  key: string | null,
): Promise<TradeAsset | { error: string }> {
  if (given.toLowerCase() === "native") {
    const { symbol, decimals } = chain.evm!.nativeCurrency;
    return { address: LIFI_NATIVE, symbol, decimals };
  }
  const found = await lifiToken(chain.evm!.id, given, key);
  return (
    found ?? {
      error: `"${given}" is not a token LI.FI knows on ${chain.name}. Use its symbol or contract address.`,
    }
  );
}

function heldBalance(chain: ChainStrategy, token: TradeAsset, owner: string): Promise<bigint> {
  const client = publicClientFor(chain.evm!.id);
  const address = owner as Address;
  return token.address === LIFI_NATIVE
    ? client.getBalance({ address })
    : client.readContract({
        address: token.address as Address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      });
}

/** Whether the sold token has to be approved, or can go by a Permit2 signature, before the quote's transaction. */
async function planApproval(
  context: PluginContext,
  { from, sell, amount, sender }: TradeRequest,
  { provider, payment }: TradeQuote & { payment: EvmPayment },
): Promise<Approval> {
  if (sell.address === LIFI_NATIVE || payment.skipApproval) return { needsApproval: false };
  const chainId = from.evm!.id;
  const token = sell.address as Address;
  const owner = sender as Address;

  // Permit2 first: a plain approval costs a transaction and a wait.
  if (provider.permitTargets) {
    const targets = await provider.permitTargets(chainId).catch(() => null);
    const permit = await planPermit(chainId, token, owner, amount, targets, {
      canSignTypedData: canSign(context),
    }).catch(() => null);
    if (permit && targets) return { needsApproval: permit.approve !== undefined, permit, targets };
  }

  const allowance = await publicClientFor(chainId).readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, payment.spender],
  });
  return { needsApproval: allowance < amount };
}

function canSign(context: PluginContext): boolean {
  try {
    return typeof context.account.signer().signTypedData === "function";
  } catch {
    return false;
  }
}

/** Thrown while an approval is still in flight: the trade has not started. */
export class ApprovalPending extends Error {
  constructor(symbol: string, chain: string) {
    super(
      `The ${symbol} approval is still waiting to confirm on ${chain}, so nothing was traded. ` +
        "Run the trade again once it has.",
    );
    this.name = "ApprovalPending";
  }
}

async function sendTrade(
  context: PluginContext,
  from: ChainStrategy,
  { fromToken: sell, quote, needsApproval, permit, targets }: Trade,
  payment: EvmPayment,
  respond: Respond,
): Promise<{ approval?: Hex; hash: Hex }> {
  const chainId = from.evm!.id;
  const token = sell.address as Address;
  const account = context.account.signer();
  const client = walletClientFor(account, chainId);
  let approval: Hex | undefined;

  if (needsApproval) {
    // Permit2 is approved once, for everything: the allowance after this is
    // spent only against a signature naming the amount and a deadline.
    const spender = permit?.approve?.spender ?? payment.spender;
    const allowed = permit?.approve?.amount ?? quote.sold;

    approval = await client.sendTransaction({
      account,
      chain: null,
      to: token,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, allowed] }),
    });

    const follow = from.explorer.transactionUrl(approval);
    await respond({
      kind: "widget",
      fallback: `Approving ${sell.symbol} on ${from.name}`,
      widget: W.card(
        [
          W.stat(`Approving ${sell.symbol}`, {
            label: `On ${from.name}`,
            caption: "The swap goes out as soon as this confirms, usually within a minute.",
            tone: "brand",
          }),
          W.code(approval, { label: "Approval" }),
          ...(follow ? [W.link(`View on ${from.explorer.name}`, follow)] : []),
        ],
        { title: "Approval sent", icon: "time-outline", tone: "brand" },
      ),
    });

    let receipt;
    try {
      receipt = await publicClientFor(chainId).waitForTransactionReceipt({ hash: approval, timeout: 120_000 });
    } catch {
      throw new ApprovalPending(sell.symbol, from.name);
    }
    if (receipt.status === "reverted") {
      throw new Error(`The ${sell.symbol} approval was rejected on ${from.name}. Nothing was traded.`);
    }
  }

  const call =
    permit && targets
      ? await permittedCall(chainId, account, targets, permit, {
          token,
          amount: quote.sold,
          diamondCalldata: payment.data,
        })
      : { to: payment.to, data: payment.data };

  const hash = await client.sendTransaction({
    account,
    chain: null,
    to: call.to,
    data: call.data,
    value: payment.value,
    // The proxy adds its own work, so the router's estimate no longer covers it.
    gas: permit ? undefined : payment.gas,
  });
  return { approval, hash };
}

export const evmLeg: TradeLeg = {
  receivable: (chain) => popularTokens(chain.evm!.id),
  token: (chain, given, keys) => resolveToken(chain, given, keys.lifi),
  held: heldBalance,

  async shortfall({ from, sell, amount }, held, quote) {
    if (sell.address !== LIFI_NATIVE) return null;
    const gas = (quote.gas ?? []).reduce((sum, cost) => sum + cost.amount, 0n);
    if (held >= amount + gas) return null;
    const { symbol } = sell;
    return (
      `Not enough ${symbol} on ${from.name}. You hold ${amountOf(held, sell)} ${symbol} and ` +
      `this trade needs ${amountOf(amount, sell)} ${symbol} plus about ${amountOf(gas, sell)} ${symbol} in fees. ` +
      `Lower the amount or add ${symbol} on ${from.name}.`
    );
  },

  approval: async (context, request, quote) =>
    quote.payment.kind === "evm"
      ? planApproval(context, request, { ...quote, payment: quote.payment })
      : { needsApproval: false },

  async send(context, chain, trade, respond) {
    const { payment } = trade.quote;
    if (payment.kind !== "evm") throw new Error("An EVM trade needs an EVM transaction.");
    return { ...(await sendTrade(context, chain, trade, payment, respond)), state: "done" };
  },
};

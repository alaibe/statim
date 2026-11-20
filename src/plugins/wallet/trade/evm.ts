import { type Address, encodeFunctionData, erc20Abi, formatUnits, type Hex } from "viem";

import type { CommandInvocation, PluginContext } from "@/core/plugins/types";
import { W } from "@/design/widgets";
import { publicClientFor, trimDecimals } from "@/lib/evm/chains";
import { type PermitPlan, type PermitTargets, permittedCall, planPermit } from "@/lib/evm/permit";
import { explorerUrlFor } from "@/lib/evm/transactions";
import { walletClientFor } from "@/lib/evm/wallet";
import { LIFI_NATIVE, lifiToken } from "@/lib/lifi";

import type { TradeAsset, TradeChain, TradeQuote, TradeRequest } from "./provider";

type Respond = CommandInvocation["respond"];

export const amountOf = (units: string | bigint, token: Pick<TradeAsset, "decimals">) =>
  trimDecimals(formatUnits(BigInt(units), token.decimals));

export async function resolveToken(
  chain: TradeChain,
  given: string,
  key: string | null,
): Promise<TradeAsset | { error: string }> {
  if (given.toLowerCase() === "native") {
    const { symbol, decimals } = chain.evm.nativeCurrency;
    return { address: LIFI_NATIVE, symbol, decimals };
  }
  const found = await lifiToken(chain.evm.id, given, key);
  return (
    found ?? {
      error: `"${given}" is not a token LI.FI knows on ${chain.name}. Use its symbol or contract address.`,
    }
  );
}

export function heldBalance(chain: TradeChain, token: TradeAsset, owner: Address): Promise<bigint> {
  const client = publicClientFor(chain.evm.id);
  return token.address === LIFI_NATIVE
    ? client.getBalance({ address: owner })
    : client.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

export interface Approval {
  needsApproval: boolean;
  permit?: PermitPlan;
  targets?: PermitTargets;
}

/** Whether the sold token has to be approved, or can go by a Permit2 signature, before the quote's transaction. */
export async function planApproval(
  context: PluginContext,
  { from, sell, amount, sender }: TradeRequest,
  { provider, payment }: TradeQuote,
): Promise<Approval> {
  if (sell.address === LIFI_NATIVE || payment.skipApproval) return { needsApproval: false };

  // Permit2 first: a plain approval costs a transaction and a wait.
  if (provider.permitTargets) {
    const targets = await provider.permitTargets(from.evm.id).catch(() => null);
    const permit = await planPermit(from.evm.id, sell.address, sender, amount, targets, {
      canSignTypedData: canSign(context),
    }).catch(() => null);
    if (permit && targets) return { needsApproval: permit.approve !== undefined, permit, targets };
  }

  const allowance = await publicClientFor(from.evm.id).readContract({
    address: sell.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [sender, payment.spender],
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

export async function sendTrade(
  context: PluginContext,
  from: TradeChain,
  { sell, quote, needsApproval, permit, targets }: Approval & { sell: TradeAsset; quote: TradeQuote },
  respond: Respond,
): Promise<{ approval?: Hex; hash: Hex }> {
  const { payment } = quote;
  const account = context.account.signer();
  const client = walletClientFor(account, from.evm.id);
  let approval: Hex | undefined;

  if (needsApproval) {
    // Permit2 is approved once, for everything: the allowance after this is
    // spent only against a signature naming the amount and a deadline.
    const spender = permit?.approve?.spender ?? payment.spender;
    const allowed = permit?.approve?.amount ?? quote.sold;

    approval = await client.sendTransaction({
      account,
      chain: null,
      to: sell.address,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, allowed] }),
    });

    const follow = explorerUrlFor(from.evm.id, approval);
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
      receipt = await publicClientFor(from.evm.id).waitForTransactionReceipt({ hash: approval, timeout: 120_000 });
    } catch {
      throw new ApprovalPending(sell.symbol, from.name);
    }
    if (receipt.status === "reverted") {
      throw new Error(`The ${sell.symbol} approval was rejected on ${from.name}. Nothing was traded.`);
    }
  }

  const call =
    permit && targets
      ? await permittedCall(from.evm.id, account, targets, permit, {
          token: sell.address,
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

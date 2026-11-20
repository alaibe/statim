import { type Address, encodeFunctionData, formatUnits, zeroAddress } from "viem";

import { LIFI_NATIVE } from "@/lib/lifi";
import { THORCHAIN_ROUTER_ABI, ThorchainError, thorInbound, thorQuote, thorStatus } from "@/lib/thorchain";
import { planDeposit } from "../bitcoin/deposit";
import { BTC } from "./bitcoin";
import { type TradeAsset, type TradeChain, type TradeProvider, TradeRefusal } from "./provider";

/** THORChain's name for each chain it shares with the wallet. Arbitrum, Optimism and Polygon are not on it. */
const PREFIX: Record<string, string> = { bitcoin: "BTC", ethereum: "ETH", base: "BASE" };

/** The short asset names a memo may use. */
const SHORT: Record<string, string> = { b: "BTC.BTC", e: "ETH.ETH", f: "BASE.ETH" };

const MEMO_BYTES = 80;

export function thorAsset(chain: TradeChain, token: TradeAsset): string | null {
  const prefix = PREFIX[chain.id];
  if (!prefix) return null;
  if (!chain.evm) return `${prefix}.${prefix}`;
  if (token.address === LIFI_NATIVE) return `${prefix}.${chain.evm.nativeCurrency.symbol}`;
  return `${prefix}.${token.symbol.toUpperCase()}-${token.address.toUpperCase()}`;
}

/** THORChain counts every asset in units of 1e8. */
export const to1e8 = (amount: bigint, decimals: number) =>
  decimals >= 8 ? amount / 10n ** BigInt(decimals - 8) : amount * 10n ** BigInt(8 - decimals);

export const from1e8 = (amount: bigint, decimals: number) =>
  decimals >= 8 ? amount * 10n ** BigInt(decimals - 8) : amount / 10n ** BigInt(8 - decimals);

/** What a swap memo pays out, to whom, and the least it accepts, or null when it is not one. */
export function readMemo(memo: string): { asset: string; destination: string; limit: bigint } | null {
  const [action = "", asset, destination, limit = ""] = memo.split(":");
  const least = limit.split("/")[0];
  if (!["=", "s", "swap"].includes(action.toLowerCase()) || !asset || !destination || !/^\d+$/.test(least)) {
    return null;
  }
  return { asset: SHORT[asset.toLowerCase()] ?? asset.toUpperCase(), destination, limit: BigInt(least) };
}

/** A memo may shorten a token's contract to its last characters, or drop it. */
function namesAsset(named: string, wanted: string): boolean {
  const [base, tail] = named.split("-");
  const [wantedBase, wantedTail = ""] = wanted.split("-");
  return base === wantedBase && (tail === undefined || wantedTail.endsWith(tail));
}

const untrusted = (what: string) => new ThorchainError(0, `THORChain's quote ${what}, so it was not used.`);

export const thorchain: TradeProvider = {
  id: "thorchain",
  name: "THORChain",
  site: "https://thorchain.org",
  covers: ({ from, to }) =>
    (from.id === "bitcoin" && to.evm !== undefined && to.id in PREFIX) ||
    (to.id === "bitcoin" && from.evm !== undefined && from.id in PREFIX),

  async quote({ from, to, sell, buy, amount, sender, recipient, slippage }) {
    const fromAsset = thorAsset(from, sell);
    const toAsset = thorAsset(to, buy);
    if (!fromAsset || !toAsset) throw new ThorchainError(0, "THORChain does not trade that pair.");
    const units = to1e8(amount, sell.decimals);
    const sold = from1e8(units, sell.decimals);

    const [quote, inbound] = await Promise.all([
      thorQuote({
        fromAsset,
        toAsset,
        amount: units,
        destination: recipient,
        toleranceBps: Math.round(slippage * 10_000),
      }),
      thorInbound(PREFIX[from.id]),
    ]);
    if (!inbound || inbound.halted || inbound.chain_trading_paused || inbound.global_trading_paused) {
      throw new ThorchainError(0, `THORChain is not taking deposits on ${from.name} right now. Try again later.`);
    }
    const vault = quote.inbound_address;
    if (inbound.address.toLowerCase() !== vault.toLowerCase()) throw untrusted("named a vault THORChain does not list");
    if (from.evm && (!quote.router || inbound.router?.toLowerCase() !== quote.router.toLowerCase())) {
      throw untrusted("named a router THORChain does not list");
    }
    const memo = readMemo(quote.memo);
    if (!memo || !namesAsset(memo.asset, toAsset) || memo.destination.toLowerCase() !== recipient.toLowerCase()) {
      throw untrusted("would pay out something else, or somewhere else");
    }
    if (memo.limit === 0n) throw untrusted("carried no price limit");
    if (new TextEncoder().encode(quote.memo).length > MEMO_BYTES)
      throw untrusted("carried a memo too long for Bitcoin");

    const least = BigInt(quote.recommended_min_amount_in ?? "0");
    if (units < least) {
      throw new TradeRefusal(
        `THORChain needs at least ${formatUnits(least, 8)} ${sell.symbol} for this trade, ` +
          "so that a failed one can still be refunded.",
      );
    }

    const common = {
      provider: thorchain,
      route: "THORChain",
      sold,
      receive: from1e8(BigInt(quote.expected_amount_out), buy.decimals),
      receiveMin: from1e8(memo.limit, buy.decimals),
      seconds: quote.total_swap_seconds ?? 0,
      fees: [{ amount: from1e8(BigInt(quote.fees.total), buy.decimals), token: buy }],
    };

    if (from.evm) {
      const router = quote.router as Address;
      const native = sell.address === LIFI_NATIVE;
      return {
        ...common,
        payment: {
          kind: "evm",
          to: router,
          data: encodeFunctionData({
            abi: THORCHAIN_ROUTER_ABI,
            functionName: "depositWithExpiry",
            args: [
              vault as Address,
              native ? zeroAddress : (sell.address as Address),
              sold,
              quote.memo,
              BigInt(quote.expiry),
            ],
          }),
          value: native ? sold : 0n,
          spender: router,
        },
      };
    }

    const deposit = { to: vault, sats: sold, memo: quote.memo, minFeeRate: Number(quote.recommended_gas_rate ?? 1) };
    const planned = await planDeposit(sender, deposit);
    if ("error" in planned) throw new TradeRefusal(planned.error);
    return {
      ...common,
      gas: [{ amount: planned.plan.fee, token: BTC }],
      payment: { kind: "bitcoin", deposit },
    };
  },

  refusal: (error) => (error instanceof ThorchainError || error instanceof TradeRefusal ? error.message : null),

  async status(hash, { to }) {
    const { stages = {}, planned_out_txs = [], out_txs = [] } = await thorStatus(hash);
    const [out] = out_txs;
    const done = stages.outbound_signed?.completed === true && out !== undefined;
    const refund = planned_out_txs.some((tx) => tx.refund);
    const outUrl = !out
      ? null
      : out.chain === "BTC"
        ? `https://mempool.space/tx/${out.id.toLowerCase()}`
        : to.evm?.blockExplorers?.default
          ? `${to.evm.blockExplorers.default.url}/tx/0x${out.id.toLowerCase()}`
          : null;

    return {
      ...(done
        ? refund
          ? { label: "Refunded", tone: "warning" as const }
          : { label: "Done", tone: "success" as const }
        : stages.inbound_observed?.completed
          ? { label: "In progress", tone: "brand" as const }
          : { label: "Not seen yet", tone: "warning" as const }),
      rows: (out?.coins ?? []).map((coin) => ({
        label: refund ? "Refunded" : "Received",
        value: `${formatUnits(BigInt(coin.amount), 8)} ${coin.asset.split(".")[1]?.split("-")[0] ?? coin.asset}`,
      })),
      links: outUrl ? [{ label: "View the payout", url: outUrl }] : [],
      open: !done,
    };
  },
};

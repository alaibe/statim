import { parseUnits } from "viem";
import { shortAddress } from "@/core/account/keyring";
import { loadLcxKey, loadTradeKey } from "@/core/account/trade-key";
import { flagValue, withoutFlag } from "@/core/commands/flags";
import type { CommandInvocation, CommandResult, PluginContext, SlashCommand } from "@/core/plugins/types";
import { W, type Widget, type WidgetOption, type WidgetRow } from "@/design/widgets";
import type { PermitPlan } from "@/lib/evm/permit";
import { activeChain, defaultChain, NO_CHAIN_ON, pickStrategy } from "../chain-list";
import { type ChainStrategy, selfAddressOf, sendableChains, targetAddress } from "../chains/strategy";
import { assetField, withoutConfirm } from "../commands";
import { sentPaymentErrorMessage, walletErrorMessage } from "../errors";
import { bitcoinLeg } from "./bitcoin";
import { ApprovalPending, amountOf, evmLeg } from "./evm";
import { jupiter } from "./jupiter";
import { lcx } from "./lcx";
import { lifi } from "./lifi";
import {
  type Cost,
  type Sent,
  type Trade,
  type TradeAsset,
  type TradeKeys,
  type TradeLeg,
  type TradeProvider,
  type TradeQuote,
  TradeRefusal,
  type TradeRequest,
} from "./provider";
import { solanaLeg } from "./solana";
import { thorchain } from "./thorchain";

type Respond = CommandInvocation["respond"];

const SLIPPAGE = 0.005;

/** Asked in this order, which settles a tie between equal quotes. */
const PROVIDERS: TradeProvider[] = [lifi, lcx, jupiter, thorchain];

const poweredBy = (provider: TradeProvider) => W.link(`Powered by ${provider.name}`, provider.site);

const legOf = (chain: ChainStrategy): TradeLeg => (chain.evm ? evmLeg : chain.id === "solana" ? solanaLeg : bitcoinLeg);

/** One entry per label on a chain, so a held token does not repeat a listed one. */
function receiveOptions(chains: ChainStrategy[], held: WidgetOption[]): WidgetOption[] {
  const common = chains.flatMap((c) =>
    legOf(c)
      .receivable(c)
      .map((token) => ({
        label: token.symbol,
        value: token.address,
        when: { to: c.id },
      })),
  );
  const seen = new Set<string>();
  return [...common, ...held].filter((option) => {
    const key = `${option.when?.to}:${option.label.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chainNamed(chains: ChainStrategy[], named: string): ChainStrategy | { error: string } {
  const picked = pickStrategy(chains, named);
  return "error" in picked ? picked : picked.chain;
}

const statusCommand = (hash: string, from: ChainStrategy, to: ChainStrategy) =>
  `/trade --status ${hash} --from ${from.id} --to ${to.id}`;

const usd = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value) ? `$${value.toFixed(2)}` : null;

function costLine(costs: Cost[] | undefined): string | null {
  if (!costs?.length) return null;
  const byToken = new Map<string, { units: bigint; token: TradeAsset }>();
  for (const cost of costs) {
    const entry = byToken.get(cost.token.symbol) ?? { units: 0n, token: cost.token };
    entry.units += cost.amount;
    byToken.set(cost.token.symbol, entry);
  }
  const amounts = [...byToken.values()]
    .map(({ units, token }) => `${amountOf(units, token)} ${token.symbol}`)
    .join(" + ");
  const total = costs.reduce((sum, cost) => sum + (cost.usd ?? NaN), 0);
  return Number.isFinite(total) ? `${amounts} (≈ $${total.toFixed(2)})` : amounts;
}

const duration = (seconds: number) =>
  seconds < 60 ? `${Math.max(1, Math.round(seconds))} s` : `${Math.ceil(seconds / 60)} min`;

interface Given {
  amount?: string;
  token?: string;
  receive?: string;
  recipient?: string;
}

async function tradeForm(
  chains: ChainStrategy[],
  from: ChainStrategy,
  to: ChainStrategy,
  given: Given,
  context: PluginContext,
  respond: Respond,
): Promise<CommandResult> {
  const assets = await assetField(chains, context);
  const choices = chains.map((c) => ({ label: c.name, value: c.id }));

  await respond({
    kind: "widget",
    fallback: `Trade on ${from.name}`,
    widget: W.card(
      [
        W.form(
          [
            { id: "from", label: "From", value: from.id, options: choices },
            {
              id: "token",
              label: "Asset",
              value: assets.held(from.id, given.token)?.id ?? "native",
              options: assets.options("from"),
              select: true,
            },
            {
              id: "amount",
              label: "Amount in {token}",
              placeholder: "0.01",
              keyboard: "decimal",
              value: given.amount ?? "",
            },
            { id: "to", label: "To", value: to.id, options: choices },
            {
              id: "receive",
              label: "Receive",
              value: given.receive ?? "",
              options: receiveOptions(chains, assets.options("to")),
              select: true,
              hint: "Any other token: type it after /trade, as a symbol or a contract address.",
            },
            {
              id: "recipient",
              label: "Recipient",
              placeholder: "Your own address",
              value: given.recipient ?? "",
              optional: true,
              hint: "Leave it blank to keep the trade. Your address is the same on every EVM chain.",
            },
          ],
          {
            label: "Get a quote",
            command: "/trade {amount} {token} {receive} --from {from} --to {to} --recipient {recipient}",
          },
        ),
        W.text(
          "The same chain on both sides is a swap; different chains, a bridge. LI.FI finds " +
            "the route and quotes it, and a swap also asks LCX Liberty DEX once you save its key. " +
            "On Solana, Jupiter quotes the swap, and THORChain trades BTC with Ethereum and Base. " +
            "Nothing is signed until you confirm the quote.",
        ),
        poweredBy(lifi),
      ],
      { title: "Trade", icon: "swap-horizontal-outline" },
    ),
  });
  return { type: "handled" };
}

type Prepared = Trade | { error: string };

const refusalOf = (error: unknown, providers: TradeProvider[]) =>
  error instanceof TradeRefusal
    ? error.message
    : (providers.map((provider) => provider.refusal(error)).find((message) => message !== null) ?? null);

async function bestQuote(
  providers: TradeProvider[],
  request: TradeRequest,
): Promise<{ chosen: TradeQuote; other?: TradeQuote } | { error: string }> {
  const settled = await Promise.allSettled(providers.map((provider) => provider.quote(request)));
  const quotes = settled
    .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
    .sort((a, b) => (b.receiveMin > a.receiveMin ? 1 : b.receiveMin < a.receiveMin ? -1 : 0));
  if (quotes.length > 0) return { chosen: quotes[0], other: quotes[1] };

  const failure = (settled[0] as PromiseRejectedResult).reason;
  const refusal = refusalOf(failure, providers);
  if (refusal) return { error: refusal };
  throw failure;
}

/**
 * The balance is read before quoting, so a short balance spends none of LI.FI's small
 * unauthenticated request budget.
 */
async function prepare(
  context: PluginContext,
  from: ChainStrategy,
  to: ChainStrategy,
  { amount = "", token = "", receive = "", recipient }: Given,
  keys: TradeKeys,
): Promise<Prepared> {
  if (!/^\d*\.?\d+$/.test(amount)) return { error: `"${amount}" is not a valid amount.` };
  const providers = PROVIDERS.filter((provider) => provider.covers({ from, to, keys }));
  if (providers.length === 0) return { error: `Nothing in the app trades from ${from.name} to ${to.name}.` };

  const leg = legOf(from);
  const [fromToken, toToken] = await Promise.all([leg.token(from, token, keys), legOf(to).token(to, receive, keys)]);
  if ("error" in fromToken) return fromToken;
  if ("error" in toToken) return toToken;

  const fromAmount = parseUnits(amount, fromToken.decimals);
  if (fromAmount <= 0n) return { error: "The amount must be greater than 0." };

  const own = selfAddressOf(from, context);
  if ("error" in own) return own;
  const address = own.address;
  const ownThere = selfAddressOf(to, context);
  if ("error" in ownThere) return ownThere;
  const wanted = await targetAddress(to, context, recipient?.trim(), { resolve: true });
  if ("error" in wanted) return { error: wanted.error };
  const landsIn = wanted.address;

  const symbol = fromToken.symbol;
  const held = await leg.held(from, fromToken, address);
  if (held < fromAmount) {
    return {
      error:
        `Not enough ${symbol} on ${from.name}. You hold ${amountOf(held, fromToken)} ${symbol} and ` +
        `want to trade ${amount} ${symbol}. Lower the amount or add ${symbol} on ${from.name}.`,
    };
  }

  const request: TradeRequest = {
    from,
    to,
    sell: fromToken,
    buy: toToken,
    amount: fromAmount,
    sender: address,
    recipient: landsIn,
    slippage: SLIPPAGE,
    keys,
  };
  const best = await bestQuote(providers, request);
  if ("error" in best) return best;
  const quote = best.chosen;
  const short = await leg.shortfall(request, held, quote);
  if (short) return { error: short };

  return {
    ...((await leg.approval?.(context, request, quote)) ?? { needsApproval: false }),
    quote,
    other: best.other,
    fromToken,
    toToken,
    recipient: landsIn,
    sendsAway: landsIn !== ownThere.address,
  };
}

/** What the trade still has to send before it can swap, in plain words. */
function approvalNote(symbol: string, chain: string, needsApproval: boolean, permit: PermitPlan | undefined): string {
  if (!needsApproval) {
    return permit
      ? ` No approval is needed: ${symbol} is released by a signature you make here, for this amount only.`
      : "";
  }
  return permit?.approve
    ? ` ${symbol} needs one approval first, to Permit2, and never again on ${chain}. ` +
        "After that a signature releases each trade."
    : ` ${symbol} needs a one-time approval first: a second transaction on ${chain} before the trade.`;
}

function reviewCard(
  from: ChainStrategy,
  to: ChainStrategy,
  given: Given,
  { quote, other, fromToken, toToken, needsApproval, permit, recipient, sendsAway }: Trade,
): Widget {
  const same = from.id === to.id;
  const amount = amountOf(quote.sold, fromToken);
  const [fromUsd, toUsd] = [usd(quote.usd?.from), usd(quote.usd?.to)];
  const gas = costLine(quote.gas);
  const fees = costLine(quote.fees);

  const rows: WidgetRow[] = [
    { label: "You send", value: `${amount} ${fromToken.symbol} on ${from.name}` },
    ...(sendsAway ? [{ label: "Lands in", value: shortAddress(recipient), tone: "warning" as const }] : []),
    { label: "Route", value: quote.route },
    ...(quote.seconds > 0 ? [{ label: "Takes about", value: duration(quote.seconds) }] : []),
    ...(gas ? [{ label: "Gas fee", value: gas }] : []),
    ...(fees ? [{ label: "Route fees", value: fees }] : []),
    ...(fromUsd && toUsd ? [{ label: "Value", value: `${fromUsd} → ${toUsd}` }] : []),
    ...(other
      ? [
          {
            label: `${other.provider.name} quote`,
            value: `At least ${amountOf(other.receiveMin, toToken)} ${toToken.symbol}`,
          },
        ]
      : []),
  ];

  return W.card(
    [
      W.stat(`≈ ${amountOf(quote.receive, toToken)} ${toToken.symbol}`, {
        label: `You receive on ${to.name}`,
        caption: `At least ${amountOf(quote.receiveMin, toToken)} ${toToken.symbol} after ${SLIPPAGE * 100}% slippage`,
        tone: "brand",
      }),
      W.rows(rows),
      W.actions([
        {
          label: same ? "Confirm and swap" : "Confirm and bridge",
          command:
            `/trade ${given.amount} ${given.token} ${given.receive} --from ${from.id} --to ${to.id}` +
            `${sendsAway ? ` --recipient ${recipient}` : ""} --confirm`,
        },
      ]),
      W.text(
        (sendsAway ? `This lands in ${shortAddress(recipient)}, not your own address. ` : "") +
          "The quote is taken again when you confirm, so the amount can move a little with the " +
          "market. Nothing is signed until then." +
          approvalNote(fromToken.symbol, from.name, needsApproval, permit),
      ),
      poweredBy(quote.provider),
    ],
    {
      title: same ? `Swap on ${from.name}` : `Bridge ${from.name} → ${to.name}`,
      icon: "swap-horizontal-outline",
      tone: "brand",
    },
  );
}

function sentCard(
  from: ChainStrategy,
  to: ChainStrategy,
  { quote, fromToken, toToken }: Trade,
  { approval, hash, state }: Sent,
): Widget {
  const same = from.id === to.id;
  const settled = state === "done";
  const amount = amountOf(quote.sold, fromToken);
  const tracker = quote.provider.tracker?.(hash);
  const explorer = from.explorer.transactionUrl(hash) ?? tracker?.url;
  return W.card(
    [
      W.stat(`${amount} ${fromToken.symbol} → ≈ ${amountOf(quote.receive, toToken)} ${toToken.symbol}`, {
        label: !settled
          ? `Sent on ${from.name}, not confirmed yet`
          : same
            ? `Swapped on ${from.name}`
            : `Sent from ${from.name} to ${to.name}`,
        tone: settled ? "success" : "brand",
      }),
      ...(approval ? [W.code(approval, { label: "Approval" })] : []),
      W.code(hash, { label: "Transaction" }),
      ...(explorer ? [W.link(`View on ${from.explorer.name}`, explorer)] : []),
      ...(tracker ? [W.link(tracker.label, tracker.url)] : []),
      ...(same
        ? []
        : [
            W.actions([{ label: "Check status", command: statusCommand(hash, from, to) }]),
            W.text(
              `${quote.seconds > 0 ? `This usually takes about ${duration(quote.seconds)}.` : "Bridges take a few minutes."} ` +
                `Check status asks ${quote.provider.name} how far along it is.`,
            ),
          ]),
      poweredBy(quote.provider),
    ],
    settled
      ? { title: same ? "Swapped" : "Bridge started", icon: "checkmark-circle", tone: "success" }
      : { title: "Swap sent", icon: "time-outline", tone: "brand" },
  );
}

async function statusCard(
  hash: string,
  from: ChainStrategy,
  to: ChainStrategy,
  keys: TradeKeys,
  respond: Respond,
): Promise<CommandResult> {
  const provider = from.id === to.id ? undefined : PROVIDERS.find((p) => p.status && p.covers({ from, to, keys }));
  if (!provider?.status) {
    return {
      type: "error",
      message: "Only a trade between two chains has a status to check. Follow a swap on its explorer.",
    };
  }
  try {
    const { label, tone, caption, rows, links, open } = await provider.status(hash, { from, to, keys });
    await respond({
      kind: "widget",
      fallback: `Bridge ${label.toLowerCase()}`,
      widget: W.card(
        [
          W.stat(label, { label: `Bridge ${from.name} → ${to.name}`, caption, tone }),
          W.rows(rows),
          ...links.map((link) => W.link(link.label, link.url)),
          ...(open ? [W.actions([{ label: "Check again", command: statusCommand(hash, from, to) }])] : []),
          poweredBy(provider),
        ],
        { title: "Bridge status", icon: "swap-horizontal-outline", tone },
      ),
    });
    return { type: "handled" };
  } catch (error) {
    return { type: "error", message: refusalOf(error, [provider]) ?? walletErrorMessage(error, from, "status") };
  }
}

function tradeArgs(args: string[]) {
  const [amount, token, receive] = withoutConfirm(
    ["--from", "--to", "--status", "--recipient"].reduce((rest, flag) => withoutFlag(rest, flag), args),
  );
  const given: Given = { amount, token, receive, recipient: flagValue(args, "--recipient") };
  return {
    fromId: flagValue(args, "--from"),
    toId: flagValue(args, "--to"),
    status: flagValue(args, "--status"),
    confirmed: args.includes("--confirm"),
    given,
  };
}

async function tradeRoute(
  chains: ChainStrategy[],
  fromId: string | undefined,
  toId: string | undefined,
  context: PluginContext,
): Promise<{ from: ChainStrategy; to: ChainStrategy } | { error: string }> {
  const from = fromId ? chainNamed(chains, fromId) : defaultChain(chains, undefined, (await activeChain(context))?.id);
  if ("error" in from) return from;
  const to = toId ? chainNamed(chains, toId) : from;
  if ("error" in to) return to;
  return { from, to };
}

async function quoteOrTrade(
  context: PluginContext,
  { from, to }: { from: ChainStrategy; to: ChainStrategy },
  given: Given,
  keys: TradeKeys,
  confirmed: boolean,
  respond: Respond,
): Promise<CommandResult> {
  let prepared: Prepared;
  try {
    prepared = await prepare(context, from, to, given, keys);
  } catch (error) {
    return { type: "error", message: walletErrorMessage(error, from, "quote") };
  }
  if ("error" in prepared) return { type: "error", message: `${prepared.error} Nothing was sent.` };

  if (!confirmed) {
    await respond({
      kind: "widget",
      fallback: `Trade ${given.amount} ${prepared.fromToken.symbol} for ${prepared.toToken.symbol}?`,
      widget: reviewCard(from, to, given, prepared),
    });
    return { type: "handled" };
  }

  let sent: Sent | undefined;
  try {
    sent = await legOf(from).send(context, from, prepared, respond);
    if (sent.state === "failed") {
      return {
        type: "error",
        message:
          `The trade failed on ${from.name}, so nothing was traded and only its fee was spent. ` +
          (from.explorer.transactionUrl(sent.hash) ?? sent.hash),
      };
    }
    await respond({
      kind: "widget",
      fallback: `Sent ${given.amount} ${prepared.fromToken.symbol} for ${prepared.toToken.symbol}`,
      widget: sentCard(from, to, prepared, sent),
    });
    return { type: "handled" };
  } catch (error) {
    if (error instanceof ApprovalPending) return { type: "error", message: error.message };
    return {
      type: "error",
      message: sent ? sentPaymentErrorMessage(from.name, sent.hash, "trade") : walletErrorMessage(error, from, "trade"),
    };
  }
}

export const tradeCommand: SlashCommand = {
  name: "trade",
  aliases: ["swap", "bridge"],
  description: "Swap a token, or bridge it to another chain",
  showIn: ["channel"],
  usage: "/trade <amount> <asset> <asset to receive> [--from base] [--to arbitrum] [--recipient 0x…]",
  async run({ args, context, respond }) {
    const chains = sendableChains();
    if (chains.length === 0) return { type: "error", message: NO_CHAIN_ON };

    const { fromId, toId, status, confirmed, given } = tradeArgs(args);
    const route = await tradeRoute(chains, fromId, toId, context);
    if ("error" in route) return { type: "error", message: route.error };
    const { from, to } = route;
    const blocked = from.unavailable?.(context) ?? null;
    if (blocked) return blocked;

    if (!status && (!given.amount || !given.token || !given.receive)) {
      return tradeForm(chains, from, to, given, context, respond);
    }

    const accountId = context.account.accountId;
    const key = accountId ? await loadTradeKey(accountId) : null;
    const keys = { lifi: key, lcx: accountId ? await loadLcxKey(accountId) : null };
    if (status) return statusCard(status, from, to, keys, respond);
    return quoteOrTrade(context, route, given, keys, confirmed, respond);
  },
};

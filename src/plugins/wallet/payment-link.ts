import { type Address, formatEther, formatUnits, isAddress } from "viem";

import { shortAddress } from "@/core/account/keyring";
import type { WidgetContent } from "@/core/messaging/types";
import { W } from "@/design/widgets";
import { looksLikeEnsName } from "@/lib/evm/ens";
import { displayToken } from "@/lib/evm/tokens";
import { isBitcoinAddress } from "./bitcoin/address";
import { EVM_CHAINS } from "./chains/evm";
import type { ChainId } from "./chains/strategy";
import { looksLikeSolanaAddress } from "./solana/address";

export interface PaymentLink {
  chain: ChainId;
  to: string;
  /** In the coin's or token's own units, as /send takes it. */
  amount?: string;
  token?: Address;
  /** A token amount in its smallest unit, which the token's decimals turn into `amount`. */
  units?: bigint;
  note?: string;
}

type Parsed = PaymentLink | { error: string };

export const PAYMENT_SCHEMES = ["ethereum", "bitcoin", "solana"];

const IN_TEXT = /\b(?:ethereum|bitcoin|solana):[^\s<>"'`]+/gi;

/** A link in `text` the wallet can pay; one it cannot is left to the message's other cards. */
export function findPaymentLink(text: string): string | null {
  if (!text.includes(":")) return null;
  for (const [candidate] of text.matchAll(IN_TEXT)) {
    const uri = candidate.replace(/[.,;!)]+$/, "");
    const link = parsePaymentLink(uri);
    if (link && !("error" in link)) return uri;
  }
  return null;
}

/** Null when `uri` is not a payment link at all; an error when it is one the wallet cannot pay. */
export function parsePaymentLink(uri: string): Parsed | null {
  const scheme = uri.slice(0, uri.indexOf(":")).toLowerCase();
  const rest = uri.slice(scheme.length + 1);
  const query = rest.indexOf("?");
  const path = query === -1 ? rest : rest.slice(0, query);
  const params = new URLSearchParams(query === -1 ? "" : rest.slice(query + 1));

  if (scheme === "ethereum") return ethereumLink(path, params);
  if (scheme === "bitcoin") return bitcoinLink(path, params);
  if (scheme === "solana") return solanaLink(path, params);
  return null;
}

function ethereumLink(path: string, params: URLSearchParams): Parsed | null {
  const match = /^(?:pay-)?([^@/]+)(?:@(\d+))?(?:\/(.+))?$/.exec(path);
  if (!match) return null;
  const [, target, chainNumber = "1", method] = match;
  if (!isAddress(target) && !looksLikeEnsName(target)) return null;

  const spec = EVM_CHAINS.find((c) => c.chain.id === Number(chainNumber));
  if (!spec)
    return { error: `This link asks for a payment on chain ${chainNumber}, where Statim's wallet does not send.` };

  if (method === undefined) {
    const wei = params.has("value") ? wholeNumber(params.get("value")!) : 0n;
    if (wei === null) return { error: "This link's amount is not a whole number of wei." };
    return { chain: spec.id, to: target, ...(wei > 0n ? { amount: formatEther(wei) } : {}) };
  }

  if (method !== "transfer") {
    return { error: `This link calls ${method} on a contract, and Statim's wallet only makes payments.` };
  }
  const to = params.get("address");
  if (!isAddress(target) || !to || (!isAddress(to) && !looksLikeEnsName(to))) return null;
  const units = params.has("uint256") ? wholeNumber(params.get("uint256")!) : 0n;
  if (units === null) return { error: "This link's amount is not a whole number of the token's smallest unit." };
  return { chain: spec.id, to, token: target, ...(units > 0n ? { units } : {}) };
}

function bitcoinLink(path: string, params: URLSearchParams): Parsed | null {
  const required = [...params.keys()].find((key) => key.toLowerCase().startsWith("req-"));
  if (required) return { error: `This link requires ${required}, which Statim's wallet does not understand.` };

  const to = /^(?:bc|tb)1/i.test(path) ? path.toLowerCase() : path;
  if (!to && params.has("lightning")) {
    return { error: "This link holds only a Lightning invoice, and Statim's wallet pays on-chain only." };
  }
  if (!isBitcoinAddress(to)) return null;

  const amount = params.get("amount");
  if (amount !== null && !/^\d+(?:\.\d{1,8})?$/.test(amount)) {
    return { error: "This link's amount is not a Bitcoin amount." };
  }
  return { chain: "bitcoin", to, ...positive(amount), ...noteOf(params) };
}

function solanaLink(path: string, params: URLSearchParams): Parsed | null {
  if (!looksLikeSolanaAddress(path)) return null;
  if (params.has("spl-token"))
    return { error: "This link asks for a token on Solana, where Statim's wallet sends only SOL." };
  if (params.has("reference") || params.has("memo")) {
    return {
      error:
        "This link needs a reference sent with the payment so the shop can find it, and Statim's wallet cannot add one.",
    };
  }

  const amount = params.get("amount");
  if (amount !== null && !/^\d+(?:\.\d{1,9})?$/.test(amount))
    return { error: "This link's amount is not a SOL amount." };
  return { chain: "solana", to: path, ...positive(amount), ...noteOf(params) };
}

/** EIP-681 numbers may carry an exponent, as in 2.014e18. */
function wholeNumber(text: string): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?(?:e(\d+))?$/i.exec(text);
  if (!match) return null;
  const [, whole, fraction = "", exponent = "0"] = match;
  const shift = Number(exponent) - fraction.length;
  const digits = BigInt(whole + fraction);
  if (shift >= 0) return digits * 10n ** BigInt(shift);
  const scale = 10n ** BigInt(-shift);
  return digits % scale === 0n ? digits / scale : null;
}

const positive = (amount: string | null) => (amount && Number(amount) > 0 ? { amount } : {});

function noteOf(params: URLSearchParams): { note?: string } {
  const note = params.get("message") || params.get("label");
  return note ? { note } : {};
}

interface PaymentRequest {
  command: string;
  amount?: string;
  symbol: string;
  chainName: string;
}

const COINS = { bitcoin: { name: "Bitcoin", symbol: "BTC" }, solana: { name: "Solana", symbol: "SOL" } };

export async function paymentRequest(link: PaymentLink): Promise<PaymentRequest> {
  const spec = EVM_CHAINS.find((c) => c.id === link.chain);
  const coin = spec
    ? { name: spec.name, symbol: spec.chain.nativeCurrency.symbol }
    : COINS[link.chain as keyof typeof COINS];
  let { amount } = link;
  let symbol = coin.symbol;

  if (link.token && spec) {
    const token = await displayToken(spec.chain.id, link.token);
    if (!token) throw new Error(`${shortAddress(link.token)} is not a token on ${spec.name}.`);
    symbol = token.symbol;
    if (link.units !== undefined) amount = formatUnits(link.units, token.decimals);
  }

  const words = ["/send", amount, link.to, "--chain", link.chain, ...(link.token ? ["--token", link.token] : [])];
  return { command: words.filter(Boolean).join(" "), amount, symbol, chainName: coin.name };
}

export async function paymentCard(uri: string): Promise<Omit<WidgetContent, "live">> {
  const link = parsePaymentLink(uri);
  if (!link) throw new Error("That is not a payment link.");
  if ("error" in link) throw new Error(link.error);
  const { command, amount, symbol, chainName } = await paymentRequest(link);
  const to = looksLikeEnsName(link.to) ? link.to : shortAddress(link.to);

  return {
    kind: "widget",
    fallback: `Payment request: ${amount ? `${amount} ${symbol}` : symbol} to ${link.to} on ${chainName}`,
    widget: W.card(
      [
        W.stat(amount ? `${amount} ${symbol}` : symbol, { label: `To ${to}`, tone: "brand" }),
        W.rows([{ label: "Chain", value: chainName }, ...(link.note ? [{ label: "Note", value: link.note }] : [])]),
        W.actions([{ label: amount ? "Review" : "Choose an amount", command }]),
      ],
      { title: "Payment request", icon: "arrow-up-circle-outline" },
    ),
  };
}

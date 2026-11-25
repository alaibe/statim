import { base58 } from "@scure/base";

import { shortAddress } from "@/core/account/keyring";
import type { WidgetContent } from "@/core/messaging/types";
import { W, type WidgetRow } from "@/design/widgets";
import { jsonRpc } from "@/lib/json-rpc";
import { formatSol } from "./address";
import { solanaStrategy } from "./index";
import { rpcUrl, signatureStatus } from "./rpc";
import { mintSymbol } from "./tokens";

const SIGNATURE = /\b[1-9A-HJ-NP-Za-km-z]{86,88}\b/g;

export function findSignature(text: string): string | null {
  if (text.length < 86) return null;
  for (const [candidate] of text.matchAll(SIGNATURE)) {
    try {
      if (base58.decode(candidate).length === 64) return candidate;
    } catch {}
  }
  return null;
}

interface Instruction {
  program?: string;
  parsed?: {
    type?: string;
    info?: {
      source?: string;
      destination?: string;
      authority?: string;
      lamports?: number;
      mint?: string;
      tokenAmount?: { uiAmountString: string };
    };
  };
}

export interface ParsedTransaction {
  meta: { err: unknown } | null;
  transaction: { message: { instructions: Instruction[] } };
}

interface SolanaTransaction {
  status: "success" | "failed" | "pending";
  amount?: string;
  from?: string;
  to?: string;
}

export function summarise(transaction: ParsedTransaction): SolanaTransaction {
  const status = transaction.meta?.err ? "failed" : "success";
  for (const { program, parsed } of transaction.transaction.message.instructions) {
    const info = parsed?.info;
    if (!info) continue;
    if (program === "system" && parsed.type === "transfer" && info.lamports !== undefined) {
      return { status, amount: `${formatSol(BigInt(info.lamports))} SOL`, from: info.source, to: info.destination };
    }
    if (program === "spl-token" && parsed.type === "transferChecked" && info.tokenAmount && info.mint) {
      return { status, amount: `${info.tokenAmount.uiAmountString} ${mintSymbol(info.mint)}`, from: info.authority };
    }
  }
  return { status };
}

/** How long a pending or unseen signature's answer is reused before the node is asked again. */
const RECHECK_MS = 30_000;

const lookups = new Map<string, Promise<SolanaTransaction | null>>();

function readSignature(signature: string): Promise<SolanaTransaction | null> {
  const known = lookups.get(signature);
  if (known) return known;
  const lookup = lookUp(signature);
  lookups.set(signature, lookup);
  lookup.then(
    (found) => {
      if (!found || found.status === "pending") setTimeout(() => lookups.delete(signature), RECHECK_MS);
    },
    () => lookups.delete(signature),
  );
  return lookup;
}

async function lookUp(signature: string): Promise<SolanaTransaction | null> {
  const url = rpcUrl();
  const transaction = await jsonRpc<ParsedTransaction | null>(url, "getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ]);
  if (transaction) return summarise(transaction);

  const seen = await signatureStatus(url, signature);
  return seen ? { status: seen.err ? "failed" : "pending" } : null;
}

const STATUS = {
  success: { label: "Confirmed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  pending: { label: "Pending", tone: "warning" },
} as const;

export async function signatureCard(signature: string): Promise<Omit<WidgetContent, "live">> {
  const found = await readSignature(signature);
  if (!found) throw new Error("Solana has no transaction with that signature.");

  const { label, tone } = STATUS[found.status];
  const explorer = solanaStrategy.explorer.transactionUrl(signature);
  const rows: WidgetRow[] = [
    ...(found.from ? [{ label: "From", value: shortAddress(found.from) }] : []),
    ...(found.to ? [{ label: "To", value: shortAddress(found.to) }] : []),
  ];
  return {
    kind: "widget",
    fallback: `${label} on Solana${found.amount ? `: ${found.amount}` : ""}`,
    widget: W.card(
      [
        W.stat(found.amount ?? "Transaction", { label, tone }),
        ...(rows.length ? [W.rows(rows)] : []),
        ...(explorer ? [W.link(`View on ${solanaStrategy.explorer.name}`, explorer, "arrow-up-right")] : []),
      ],
      { title: "Solana transaction", icon: "sun" },
    ),
  };
}

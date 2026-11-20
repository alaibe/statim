import { base58 } from "@scure/base";

import { shortAddress } from "@/core/account/keyring";
import type { WidgetContent } from "@/core/messaging/types";
import { W, type WidgetRow } from "@/design/widgets";
import { jsonRpc } from "@/lib/json-rpc";
import { chainStrategies } from "../chains/strategy";
import { formatSol } from "./address";
import { rpcUrl } from "./rpc";
import { mintSymbol } from "./tokens";

const SIGNATURE = /\b[1-9A-HJ-NP-Za-km-z]{86,88}\b/g;

export function findSignature(text: string): string | null {
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

async function readSignature(signature: string): Promise<SolanaTransaction | null> {
  const url = rpcUrl();
  const transaction = await jsonRpc<ParsedTransaction | null>(url, "getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ]);
  if (transaction) return summarise(transaction);

  const { value } = await jsonRpc<{ value: ({ err: unknown } | null)[] }>(url, "getSignatureStatuses", [[signature]]);
  const [seen] = value;
  return seen ? { status: seen.err ? "failed" : "pending" } : null;
}

const STATUS = {
  success: { label: "Confirmed", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  pending: { label: "Pending", tone: "warning" },
} as const;

export async function signatureCard(signature: string): Promise<Omit<WidgetContent, "live">> {
  if (!chainStrategies().some((chain) => chain.id === "solana")) throw new Error("Solana is off.");
  const found = await readSignature(signature);
  if (!found) throw new Error("Solana has no transaction with that signature.");

  const { label, tone } = STATUS[found.status];
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
        W.link("View on Solscan", `https://solscan.io/tx/${signature}`, "open-outline"),
      ],
      { title: "Solana transaction", icon: "sunny-outline" },
    ),
  };
}

import { type Address, decodeFunctionData, erc20Abi, formatEther, formatUnits, type Hex } from "viem";

import { chainById, publicClientFor, trimDecimals } from "./chains";
import { describeToken } from "./tokens";

interface TransactionSummary {
  hash: Hex;
  chainId: number;
  chainName: string;
  from: Address;
  to: Address | null;
  /** What it moved, such as "25 USDC"; null for a contract call that moved no coin. */
  amount: string | null;
  status: "success" | "reverted" | "pending";
  blockNumber?: bigint;
  explorerUrl?: string;
}

const HASH_PATTERN = /\b0x[0-9a-fA-F]{64}\b/;

export function findTransactionHash(text: string): Hex | null {
  const match = text.match(HASH_PATTERN);
  return match ? (match[0] as Hex) : null;
}

export function explorerUrlFor(chainId: number, hash: Hex): string | undefined {
  const explorer = chainById(chainId)?.blockExplorers?.default?.url;
  return explorer ? `${explorer}/tx/${hash}` : undefined;
}

async function readTransaction(hash: Hex, chainId: number): Promise<TransactionSummary | null> {
  const chain = chainById(chainId);
  if (!chain) return null;

  try {
    const client = publicClientFor(chainId);
    const [transaction, receipt] = await Promise.all([
      client.getTransaction({ hash }),
      client.getTransactionReceipt({ hash }).catch(() => null),
    ]);

    const token = await tokenTransfer(chainId, transaction.to, transaction.input);
    const coin = transaction.value > 0n || transaction.input === "0x";

    return {
      hash,
      chainId,
      chainName: chain.name,
      from: transaction.from,
      to: token?.to ?? transaction.to ?? null,
      amount:
        token?.amount ??
        (coin ? `${trimDecimals(formatEther(transaction.value))} ${chain.nativeCurrency.symbol}` : null),
      status: receipt ? (receipt.status === "success" ? "success" : "reverted") : "pending",
      blockNumber: receipt?.blockNumber,
      explorerUrl: explorerUrlFor(chainId, hash),
    };
  } catch {
    return null;
  }
}

async function tokenTransfer(
  chainId: number,
  contract: Address | null,
  input: Hex,
): Promise<{ to: Address; amount: string } | null> {
  if (!contract) return null;
  try {
    const call = decodeFunctionData({ abi: erc20Abi, data: input });
    if (call.functionName !== "transfer") return null;
    const token = await describeToken(chainId, contract);
    if (!token) return null;
    const [to, units] = call.args;
    return { to, amount: `${trimDecimals(formatUnits(units, token.decimals))} ${token.symbol}` };
  } catch {
    return null;
  }
}

const located = new Map<Hex, Promise<TransactionSummary | null>>();

export function locateTransaction(hash: Hex, chainIds: number[]): Promise<TransactionSummary | null> {
  const cached = located.get(hash);
  if (cached) return cached;

  const lookup = Promise.all(chainIds.map((id) => readTransaction(hash, id))).then(
    (results) => results.find((summary) => summary !== null) ?? null,
  );
  located.set(hash, lookup);
  // Only a settled transaction is worth remembering; a pending or missing one
  // may look different on the next mount.
  void lookup.then((summary) => {
    if (!summary || summary.status === "pending") located.delete(hash);
  });
  return lookup;
}

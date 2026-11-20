import type { PluginContext } from "@/core/plugins/types";
import { SOL_MINT } from "@/lib/jupiter";
import { formatSol, looksLikeSolanaAddress, SOLANA_ACCOUNT_PATH } from "../solana/address";
import {
  getBalance,
  getTokenDecimals,
  rpcUrl,
  type SignatureState,
  sendTransaction,
  signatureState,
} from "../solana/rpc";
import { fetchSplTokens, mintBySymbol, mintSymbol } from "../solana/tokens";
import { signPrepared } from "../solana/transaction";
import type { SolanaPayment, TradeAsset } from "./provider";

/** Room left for the fee, a priority fee and the rent of a new token account. */
const SOL_FEE_RESERVE = 5_000_000n;

const RECEIVE = ["USDC", "USDT", "JUP", "JitoSOL", "mSOL"];

export const solanaReceive = () =>
  RECEIVE.flatMap((symbol) => {
    const mint = mintBySymbol(symbol);
    return mint ? [{ symbol, address: mint }] : [];
  });

const SOL: TradeAsset = { address: SOL_MINT, symbol: "SOL", decimals: 9 };

export async function resolveSolanaToken(given: string): Promise<TradeAsset | { error: string }> {
  if (["native", "sol"].includes(given.toLowerCase()) || given === SOL_MINT) return SOL;
  const mint = looksLikeSolanaAddress(given) ? given : mintBySymbol(given);
  const decimals = mint ? await getTokenDecimals(rpcUrl(), mint).catch(() => null) : null;
  if (!mint || decimals === null) {
    return { error: `"${given}" is not a token Statim knows on Solana. Use its symbol or mint address.` };
  }
  return { address: mint, symbol: mintSymbol(mint), decimals };
}

export async function solanaHeld(token: TradeAsset, owner: string): Promise<bigint> {
  const url = rpcUrl();
  if (token.address === SOL_MINT) return getBalance(url, owner);
  const held = await fetchSplTokens(url, owner);
  return held.find((t) => t.mint === token.address)?.raw ?? 0n;
}

/** Why a Solana trade cannot go ahead before it is quoted: too little SOL left for its fees. */
export async function solanaFeeProblem(
  sell: TradeAsset,
  amount: bigint,
  held: bigint,
  owner: string,
): Promise<string | null> {
  const left = sell.address === SOL_MINT ? held - amount : await getBalance(rpcUrl(), owner);
  if (left >= SOL_FEE_RESERVE) return null;
  return (
    `A trade on Solana needs about ${formatSol(SOL_FEE_RESERVE)} SOL left over for its fees and any new ` +
    `token account, and this one would leave ${formatSol(left > 0n ? left : 0n)} SOL. Lower the amount or add SOL.`
  );
}

const SETTLE_TRIES = 15;
const SETTLE_INTERVAL_MS = 2_000;

export async function sendSolanaTrade(
  context: PluginContext,
  payment: SolanaPayment,
): Promise<{ hash: string; state: SignatureState }> {
  const key = context.account.deriveEd25519(SOLANA_ACCOUNT_PATH);
  const unsigned = Uint8Array.from(atob(await payment.transaction()), (c) => c.charCodeAt(0));
  const url = rpcUrl();
  const hash = await sendTransaction(url, signPrepared(unsigned, key, payment.program));

  for (let i = 0; i < SETTLE_TRIES; i++) {
    const state = await signatureState(url, hash).catch((): SignatureState => "pending");
    if (state !== "pending") return { hash, state };
    await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
  }
  return { hash, state: "pending" };
}

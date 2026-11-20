import { base64ToBytes } from "@/lib/bytes";
import { SOL_MINT } from "@/lib/jupiter";
import { formatSol, looksLikeSolanaAddress, SOLANA_ACCOUNT_PATH } from "../solana/address";
import {
  getBalance,
  getTokenBalance,
  getTokenDecimals,
  rpcUrl,
  type SignatureStatus,
  sendTransaction,
  signatureStatus,
} from "../solana/rpc";
import { mintBySymbol, mintSymbol } from "../solana/tokens";
import { signPrepared } from "../solana/transaction";
import type { Sent, TradeAsset, TradeLeg } from "./provider";

/** Room left for the fee, a priority fee and the rent of a new token account. */
const SOL_FEE_RESERVE = 5_000_000n;

const RECEIVE = ["USDC", "USDT", "JUP", "JitoSOL", "mSOL"];

const receivable = () =>
  RECEIVE.flatMap((symbol) => {
    const mint = mintBySymbol(symbol);
    return mint ? [{ symbol, address: mint }] : [];
  });

const SOL: TradeAsset = { address: SOL_MINT, symbol: "SOL", decimals: 9 };

const decimalsOf = new Map<string, number>();

async function token(given: string): Promise<TradeAsset | { error: string }> {
  if (["native", "sol"].includes(given.toLowerCase()) || given === SOL_MINT) return SOL;
  const mint = looksLikeSolanaAddress(given) ? given : mintBySymbol(given);
  const decimals = mint ? (decimalsOf.get(mint) ?? (await getTokenDecimals(rpcUrl(), mint).catch(() => null))) : null;
  if (!mint || decimals === null) {
    return { error: `"${given}" is not a token Statim knows on Solana. Use its symbol or mint address.` };
  }
  decimalsOf.set(mint, decimals);
  return { address: mint, symbol: mintSymbol(mint), decimals };
}

const held = (sold: TradeAsset, owner: string) =>
  sold.address === SOL_MINT ? getBalance(rpcUrl(), owner) : getTokenBalance(rpcUrl(), owner, sold.address);

async function shortfall(sell: TradeAsset, amount: bigint, holding: bigint, owner: string): Promise<string | null> {
  const left = sell.address === SOL_MINT ? holding - amount : await getBalance(rpcUrl(), owner);
  if (left >= SOL_FEE_RESERVE) return null;
  return (
    `A trade on Solana needs about ${formatSol(SOL_FEE_RESERVE)} SOL left over for its fees and any new ` +
    `token account, and this one would leave ${formatSol(left > 0n ? left : 0n)} SOL. Lower the amount or add SOL.`
  );
}

const SETTLE_TRIES = 15;
const SETTLE_INTERVAL_MS = 2_000;

const stateOf = (status: SignatureStatus | null): Sent["state"] =>
  !status || status.confirmationStatus === "processed" ? "pending" : status.err ? "failed" : "done";

export const solanaLeg: TradeLeg = {
  receivable,
  token: (_chain, given) => token(given),
  held: (_chain, sold, owner) => held(sold, owner),
  shortfall: ({ sell, amount, sender }, holding) => shortfall(sell, amount, holding, sender),

  async send(context, _chain, { quote: { payment } }) {
    if (payment.kind !== "solana") throw new Error("A Solana trade needs a Solana transaction.");
    const key = context.account.deriveEd25519(SOLANA_ACCOUNT_PATH);
    const url = rpcUrl();
    const hash = await sendTransaction(
      url,
      signPrepared(base64ToBytes(await payment.transaction()), key, payment.program),
    );

    for (let i = 0; i < SETTLE_TRIES; i++) {
      const state = stateOf(await signatureStatus(url, hash).catch(() => null));
      if (state !== "pending") return { hash, state };
      await new Promise((resolve) => setTimeout(resolve, SETTLE_INTERVAL_MS));
    }
    return { hash, state: "pending" };
  },
};

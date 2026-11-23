import type { PluginContext } from "@/core/plugins/types";
import { toHex } from "@/lib/bytes";
import { BIP84_ACCOUNT_PATH } from "./address";
import { broadcast, fetchFeeRates, fetchUtxos } from "./api";
import { type CoinPlan, planSpend } from "./coins";
import { apiBase } from "./config";
import { buildTransaction, opReturn, outputSize, scriptPubKey, type TxOutput } from "./transaction";

export interface Deposit {
  to: string;
  sats: bigint;
  memo: string;
  /** The least sat/vB the receiver asks for; the half-hour rate wins when it is higher. */
  minFeeRate: number;
}

export interface DepositPlan {
  plan: CoinPlan;
  feeRate: number;
  outputs: TxOutput[];
}

/** Laid out as THORChain reads it: the payment first, change to the sending address second, the memo last. */
export async function planDeposit(from: string, deposit: Deposit): Promise<DepositPlan | { error: string }> {
  const memo = opReturn(new TextEncoder().encode(deposit.memo));
  const [utxos, fees] = await Promise.all([fetchUtxos(from, apiBase()), fetchFeeRates(apiBase())]);
  const feeRate = Math.max(fees.medium, deposit.minFeeRate);

  const planned = planSpend(utxos, deposit.sats, feeRate, { extraBytes: outputSize(memo) });
  if (!planned.ok) return { error: "Not enough confirmed BTC for this amount once the fee is counted." };
  const { plan } = planned;

  const outputs: TxOutput[] = [{ script: scriptPubKey(deposit.to), value: deposit.sats }];
  if (plan.change !== null) outputs.push({ script: scriptPubKey(from), value: plan.change });
  outputs.push({ script: memo, value: 0n });
  return { plan, feeRate, outputs };
}

export async function sendDeposit(context: PluginContext, { plan, outputs }: DepositPlan): Promise<string> {
  const key = context.account.derive(BIP84_ACCOUNT_PATH);
  return broadcast(toHex(buildTransaction(plan.inputs, outputs, key.privateKey, key.publicKey)), apiBase());
}

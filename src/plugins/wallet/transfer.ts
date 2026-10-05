import type { ChatId } from '@/core/messaging/types';
import type { PluginContext } from '@/core/plugins/types';

import type { ChainStrategy, TransferParams } from './chains/strategy';
import { sentPaymentErrorMessage, walletErrorMessage } from './errors';
import { CONTENT_TYPE_PAYMENT_RECEIPT, type PaymentReceipt } from './types';

export function chainOffMessage(label: string): string {
  return `${label} is turned off. Open Wallet and use /chains to turn it on before paying.`;
}

export type CommitOutcome = { ok: true; hash: string } | { ok: false; message: string };

/**
 * Signs and broadcasts, then posts a receipt to `chatId` when there is one. Once the transfer is
 * on the chain, a later failure must never read as "try again".
 */
export async function commitTransfer(
  chain: ChainStrategy,
  context: PluginContext,
  params: TransferParams,
  {
    chatId,
    symbol = chain.transfer!.symbol,
    onSent,
  }: {
    chatId?: ChatId;
    symbol?: string;
    onSent?: (hash: string) => void | Promise<void>;
  } = {}
): Promise<CommitOutcome> {
  let hash: string | undefined;
  try {
    hash = await chain.transfer!.commit(context, params);
    await onSent?.(hash);

    if (chatId) {
      const receipt: PaymentReceipt = {
        hash,
        chain: chain.id,
        amount: params.amount,
        symbol,
        to: params.to,
      };
      await context.chat.sendCustom(chatId, CONTENT_TYPE_PAYMENT_RECEIPT, receipt);
    }
    return { ok: true, hash };
  } catch (error) {
    return {
      ok: false,
      message:
        hash === undefined
          ? walletErrorMessage(error, chain, 'send')
          : sentPaymentErrorMessage(chain.name, hash),
    };
  }
}

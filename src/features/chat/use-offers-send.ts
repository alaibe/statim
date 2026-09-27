import { chatScope } from '@/core/messaging/chat-scope';
import type { ChatId } from '@/core/messaging/types';
import { usePluginHost } from '@/core/plugins/host';

/** Whether an address here can offer to send funds: /send runs in this chat and a command can be run. */
export function useOffersSend(
  chatId: ChatId | undefined,
  onCommand: ((command: string) => void) | undefined
): boolean {
  const { registry } = usePluginHost();
  return (
    onCommand !== undefined &&
    chatId !== undefined &&
    registry.commandsFor(chatId, chatScope(chatId)).has('send')
  );
}

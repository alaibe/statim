import { conversationScope } from '@/core/messaging/conversation-scope';
import type { ConversationId } from '@/core/messaging/types';
import { usePluginHost } from '@/core/plugins/host';

/** Whether an address here can offer to send funds: /send runs in this chat and a command can be run. */
export function useOffersSend(
  conversationId: ConversationId | undefined,
  onCommand: ((command: string) => void) | undefined
): boolean {
  const { registry } = usePluginHost();
  return (
    onCommand !== undefined &&
    conversationId !== undefined &&
    registry.commandsFor(conversationId, conversationScope(conversationId)).has('send')
  );
}

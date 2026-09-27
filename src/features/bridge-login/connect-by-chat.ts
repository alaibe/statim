import { toast } from '@/design';
import { errorMessage } from '@/core/errors';
import { useChatStore } from '@/core/messaging/chat-store';
import type { Chat, ChatId } from '@/core/messaging/types';
import { openChat } from '@/features/navigation/open';
import type { KnownBridge } from '@/protocols/matrix/bridges';

const PROTOCOL = 'matrix';
const JOIN_TIMEOUT_MS = 20_000;

export function existingBotChat(chats: readonly Chat[], botId: string) {
  return chats.find(
    (c) => c.protocol === PROTOCOL && c.kind === 'dm' && c.memberIds.includes(botId)
  );
}

export async function connectByChat(bridge: KnownBridge, botId: string): Promise<void> {
  const existing = existingBotChat(useChatStore.getState().chats, botId);
  if (existing) {
    openChat(existing.id);
    return;
  }
  const { startDm, sendMessage } = useChatStore.getState();
  try {
    const chat = await startDm(PROTOCOL, botId);
    openChat(chat.id);
    if (await hasJoined(chat.id, botId)) {
      await sendMessage(chat.id, { kind: 'text', text: bridge.firstCommand });
    } else {
      toast.error(
        `The ${bridge.network} bridge did not answer. Send it “${bridge.firstCommand}” once it joins.`
      );
    }
  } catch (e) {
    toast.error(errorMessage(e, `Could not reach the ${bridge.network} bridge`));
  }
}

async function hasJoined(chatId: ChatId, botId: string): Promise<boolean> {
  const deadline = Date.now() + JOIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const members = await useChatStore
      .getState()
      .getMembers(chatId)
      .catch(() => []);
    if (members.some((member) => member.id === botId)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

import { botIdFromChat, isLocalChat, type Bot } from '@/core/messaging/bots';
import { useChatStore } from '@/core/messaging/chat-store';
import type { ChatId } from '@/core/messaging/types';

export function useBotAvatar(chatId: ChatId): Pick<Bot, 'avatar' | 'emoji'> {
  return (
    useChatStore((s) => (isLocalChat(chatId) ? s.bots[botIdFromChat(chatId)] : undefined)) ?? {}
  );
}

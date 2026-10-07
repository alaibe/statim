import { sessionFor, useChatStore } from '@/core/messaging/chat-store';
import { chatPermissions, NO_PERMISSIONS } from '@/core/messaging/permissions';
import type { ChatId } from '@/core/messaging/types';

export function useChatSession(chatId: ChatId) {
  return useChatStore((s) => sessionFor(s, chatId));
}

export function useChatPermissions(chatId: ChatId) {
  const chat = useChatStore((s) => s.chats.find((c) => c.id === chatId));
  const session = useChatSession(chatId);
  return chat ? chatPermissions(chat, session) : NO_PERMISSIONS;
}

import { useEffect } from 'react';

import { wasProactive } from '@/runtime';
import { isLocalChat } from '../messaging/bots';
import { prefsFor } from '../messaging/chat-prefs';
import { useChatStore, type ChatState } from '../messaging/chat-store';
import { contentPreview } from '../messaging/preview';
import type { ChatMessage, Chat, ChatId } from '../messaging/types';
import { totalUnread } from '../messaging/unread';
import {
  configureNotifications,
  notifyMessage,
  onNotificationTapped,
  setBadgeCount,
} from '../notifications';

export function useMessageNotifications(onTap: (id: ChatId) => void) {
  useEffect(() => {
    configureNotifications();
  }, []);

  useEffect(() => {
    const since = Date.now();
    const badge = (state: ChatState) =>
      setBadgeCount(totalUnread(state.chats, state.readAt, state.chatPrefs));
    void badge(useChatStore.getState());
    const unsubscribe = useChatStore.subscribe((state, previous) => {
      if (
        state.chats !== previous.chats ||
        state.readAt !== previous.readAt ||
        state.chatPrefs !== previous.chatPrefs
      ) {
        void badge(state);
      }
      if (state.chats === previous.chats) return;

      for (const { chat, message } of arrivals(previous.chats, state.chats, since)) {
        if (message.fromMe) continue;
        if (message.content.kind === 'system') continue;
        if (prefsFor(state.chatPrefs, chat.id).muted) continue;
        if (isLocalChat(chat.id) && !wasProactive(message.id)) continue;

        void notifyMessage({
          chatId: chat.id,
          title: chat.title,
          body: contentPreview(message.content),
        });
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => onNotificationTapped(onTap), [onTap]);
}

export function arrivals(
  previous: readonly Chat[],
  current: readonly Chat[],
  since: number
): { chat: Chat; message: ChatMessage }[] {
  const before = new Map(previous.map((c) => [c.id, c.lastMessage]));
  return current.flatMap((chat) => {
    const message = chat.lastMessage;
    const replaced = before.get(chat.id);
    if (!message || message.id === replaced?.id) return [];
    if (message.sentAt <= Math.max(since, replaced?.sentAt ?? 0)) return [];
    return [{ chat, message }];
  });
}

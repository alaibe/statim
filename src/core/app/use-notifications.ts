import { useGlobalSearchParams, useSegments } from 'expo-router';
import { useEffect, useRef } from 'react';

import { wasProactive } from '@/runtime';
import { isLocalChat } from '../messaging/bots';
import { prefsFor, type ChatPrefsMap } from '../messaging/chat-prefs';
import { useChatStore, type ChatState } from '../messaging/chat-store';
import { contentPreview } from '../messaging/preview';
import type { ChatMessage, Chat, ChatId } from '../messaging/types';
import { totalUnread } from '../messaging/unread';
import {
  appFocused,
  configureNotifications,
  notifyMessage,
  onNotificationTapped,
  setBadgeCount,
} from '../notifications';

export function useMessageNotifications(onTap: (id: ChatId) => void) {
  const segments = useSegments() as string[];
  const { id } = useGlobalSearchParams<{ id?: string }>();
  const onScreen = useRef<string | undefined>(undefined);
  useEffect(() => {
    onScreen.current = segments[0] === 'chat' ? id : undefined;
  }, [segments, id]);

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

      const reading = appFocused() ? onScreen.current : undefined;
      for (const { chat, message } of arrivals(previous.chats, state.chats, since)) {
        if (!worthNotifying(chat, message, state.chatPrefs, reading)) continue;
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

export function worthNotifying(
  chat: Chat,
  message: ChatMessage,
  prefs: ChatPrefsMap,
  reading: string | undefined
): boolean {
  if (message.fromMe || message.content.kind === 'system') return false;
  if (chat.id === reading) return false;
  if (prefsFor(prefs, chat.id).muted) return false;
  return !isLocalChat(chat.id) || wasProactive(message.id);
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

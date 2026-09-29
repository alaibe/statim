import { View } from 'react-native';

import { Icon, type IconTone } from '@/design';
import { useChatStore } from '@/core/messaging/chat-store';
import type { Chat, ChatMessage } from '@/core/messaging/types';

export function readByPeer(
  chat: Pick<Chat, 'readUpTo'> | undefined,
  message: ChatMessage
): boolean {
  return message.fromMe && (chat?.readUpTo ?? 0) >= message.sentAt;
}

/** Re-renders only when this message crosses the chat's read mark, not on every change to the chat. */
export function useReadByPeer(message: ChatMessage): boolean {
  return useChatStore((s) =>
    readByPeer(
      s.chats.find((chat) => chat.id === message.chatId),
      message
    )
  );
}

/**
 * Telegram's ticks: one once sent, two once read. `tone` (or `color`) is for a
 * message sent and not yet read; failed and read have their own.
 */
export function DeliveryIcon({
  message,
  read,
  size,
  tone = 'subtle',
  color,
}: {
  message: Pick<ChatMessage, 'status'>;
  read: boolean;
  size: number;
  tone?: IconTone;
  color?: string;
}) {
  if (message.status === 'failed') return <Icon name="alert-circle" size={size} tone="danger" />;
  if (message.status === 'sending')
    return <Icon name="time-outline" size={size} tone={tone} color={color} />;
  if (!read) return <Icon name="checkmark" size={size} tone={tone} color={color} />;
  return (
    <View className="flex-row">
      <Icon name="checkmark" size={size} tone="brand" />
      <View style={{ marginLeft: -size * 0.6 }}>
        <Icon name="checkmark" size={size} tone="brand" />
      </View>
    </View>
  );
}

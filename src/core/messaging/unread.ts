import { type ChatPrefsMap, prefsFor } from './chat-prefs';
import type { AnyChatId, ChatMessage, Chat, ChatId } from './types';

/** Kept in `readAt` for a chat marked unread by hand: before any real read time. */
export const MARKED_UNREAD = -1;

export function countsAsUnread(message: ChatMessage<AnyChatId>, since: number): boolean {
  return (
    !message.fromMe &&
    message.content.kind !== 'system' &&
    message.content.kind !== 'reaction' &&
    message.sentAt > since
  );
}

export function isUnread(chat: Chat, readAt: Record<ChatId, number>): boolean {
  const since = readAt[chat.id] ?? 0;
  if (since === MARKED_UNREAD) return true;
  const last = chat.lastMessage;
  if (!last) return false;
  if (since >= last.sentAt) return false;
  return chat.unreadCount === undefined ? countsAsUnread(last, since) : chat.unreadCount > 0;
}

export function isCaughtUp(since: number, last: ChatMessage | undefined): boolean {
  return since !== MARKED_UNREAD && (!last || since >= last.sentAt);
}

/** The number on a chat's badge: the protocol's count, else the messages loaded here. */
export function unreadBadge(chat: Chat, since: number, loaded?: readonly ChatMessage[]): number {
  if (since === MARKED_UNREAD || isCaughtUp(since, chat.lastMessage)) return 0;
  return chat.unreadCount ?? (loaded ? unreadCount(loaded, since) : 0);
}

/** A protocol's mention count lingers until it hears the chat was read, which it may never. */
export function hasUnreadMentions(chat: Chat, readAt: Record<ChatId, number>): boolean {
  return (chat.mentionCount ?? 0) > 0 && isUnread(chat, readAt);
}

export function unreadCount(messages: readonly ChatMessage[], since: number): number {
  if (since === MARKED_UNREAD) return 0;
  return messages.filter((m) => countsAsUnread(m, since)).length;
}

export function totalUnread(
  chats: readonly Chat[],
  readAt: Record<ChatId, number>,
  prefs: ChatPrefsMap
): number {
  return chats.filter((c) => !prefsFor(prefs, c.id).muted && isUnread(c, readAt)).length;
}

export function readByPeer(readUpTo: number, message: ChatMessage): boolean {
  return readUpTo >= message.sentAt;
}

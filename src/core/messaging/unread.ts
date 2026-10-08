import { type ChatPrefsMap, prefsFor } from './chat-prefs';
import { canBeUnread } from './message-rules';
import type { AnyChatId, ChatMessage, Chat, ChatId } from './types';

/** Kept in `readAt` for a chat marked unread by hand: before any real read time. */
export const MARKED_UNREAD = -1;

export function countsAsUnread(message: ChatMessage<AnyChatId>, since: number): boolean {
  return canBeUnread(message) && message.sentAt > since;
}

export function isUnread(chat: Chat, readAt: Record<ChatId, number>): boolean {
  return unreadState(chat, readAt[chat.id] ?? 0).unread;
}

export function unreadState(
  chat: Pick<Chat, 'lastMessage' | 'unreadCount'> | undefined,
  since: number,
  loaded: readonly ChatMessage[] = []
): { unread: boolean; count: number } {
  const newest = loaded.at(-1);
  const last =
    !chat?.lastMessage || (newest && newest.sentAt > chat.lastMessage.sentAt)
      ? newest
      : chat.lastMessage;
  if (since === MARKED_UNREAD) return { unread: true, count: 0 };
  if (last && since >= last.sentAt) return { unread: false, count: 0 };
  const reported = chat?.unreadCount;
  if (reported) return { unread: true, count: reported };
  const local = unreadCount(loaded, since);
  const unread = local > 0 || (reported === undefined && !!last && countsAsUnread(last, since));
  return { unread, count: reported ?? local };
}

export function isCaughtUp(since: number, last: ChatMessage | undefined): boolean {
  return since !== MARKED_UNREAD && (!last || since >= last.sentAt);
}

/** The number on a chat's badge: the protocol's count, else the messages loaded here. */
export function unreadBadge(chat: Chat, since: number, loaded?: readonly ChatMessage[]): number {
  return unreadState(chat, since, loaded).count;
}

/** A protocol's mention count lingers until it hears the chat was read, which it may never. */
export function hasUnreadMentions(chat: Chat, readAt: Record<ChatId, number>): boolean {
  return (chat.mentionCount ?? 0) > 0 && isUnread(chat, readAt);
}

export function unreadCount(messages: readonly ChatMessage[], since: number): number {
  if (since === MARKED_UNREAD) return 0;
  return messages.filter((m) => countsAsUnread(m, since)).length;
}

/** Muted and blocked chats count for nothing and never notify. */
export function isSilenced(chat: Chat, prefs: ChatPrefsMap): boolean {
  return Boolean(chat.blocked || prefsFor(prefs, chat.id).muted);
}

export function totalUnread(
  chats: readonly Chat[],
  readAt: Record<ChatId, number>,
  prefs: ChatPrefsMap
): number {
  return chats.filter((c) => !isSilenced(c, prefs) && isUnread(c, readAt)).length;
}

export function readByPeer(readUpTo: number, message: ChatMessage): boolean {
  return readUpTo >= message.sentAt;
}

import { orderChats, prefsFor, type ChatPrefsMap } from '@/core/messaging/chat-prefs';
import {
  type ChatFilter,
  chatRow,
  type Folder,
  chatListRows,
  inFolder,
  isUnreadHere,
  matchesFilter,
  networkOf,
  splitRequests,
} from '@/core/messaging/folders';
import { messagePreview } from '@/core/messaging/preview';
import type { Chat, ChatId } from '@/core/messaging/types';
import { hasUnreadMentions } from '@/core/messaging/unread';
import { protocolById } from '@/protocols';

export const isFolded = (network: string) => protocolById(network)?.external ?? true;

export function chatListContents({
  chats,
  chatPrefs,
  readAt,
  folder,
  filter,
  query,
  held,
  titleOf,
}: {
  chats: Chat[];
  chatPrefs: ChatPrefsMap;
  readAt: Record<ChatId, number>;
  folder: Folder | null;
  filter: ChatFilter;
  query: string;
  held: ReadonlySet<string>;
  titleOf: (c: Chat) => string;
}) {
  const { accepted, requests } = splitRequests(chats);
  const context = { prefs: chatPrefs, readAt };
  const ordered = orderChats(accepted, chatPrefs, { includeArchived: true });
  const scope = folder
    ? ordered.filter((c) => inFolder(c, folder, context))
    : ordered.filter((c) => !prefsFor(chatPrefs, c.id).archived);
  const unread = scope.filter((c) => isUnreadHere(c, context));

  const q = query.trim().toLowerCase();
  const include = (c: Chat) =>
    (!q ||
      titleOf(c).toLowerCase().includes(q) ||
      messagePreview(c.lastMessage).toLowerCase().includes(q)) &&
    (matchesFilter(c, filter, context) || (filter === 'unread' && held.has(c.id)));
  const nativeNetworks = new Set(
    scope.map(networkOf).filter((n): n is string => n !== undefined && !isFolded(n))
  );

  return {
    accepted,
    requests,
    scope,
    rows:
      folder || q
        ? scope.filter(include).map(chatRow)
        : chatListRows(ordered, include, isFolded, context),
    unseen: filter === 'unread' ? unread.filter((c) => !held.has(c.id)).map((c) => c.id) : [],
    unreadHere: unread.length,
    mentionsHere: scope.filter((c) => hasUnreadMentions(c, readAt)).length,
    showNetwork: !folder && nativeNetworks.size > 1,
  };
}

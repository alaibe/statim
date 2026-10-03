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
import { isBridgedNetwork, type NetworkId } from '@/core/messaging/networks';
import type { Chat, ChatId } from '@/core/messaging/types';
import { hasUnreadMentions } from '@/core/messaging/unread';
import { protocolById } from '@/protocols';

export const isFolded = (network: NetworkId) =>
  isBridgedNetwork(network) || (protocolById(network)?.folded ?? true);

export const crossesFolders = (filter: ChatFilter) => filter === 'unread' || filter === 'mentions';

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
  const { accepted, requests, blocked } = splitRequests(chats);
  const listed = [...accepted, ...blocked];
  const context = { prefs: chatPrefs, readAt };
  const ordered = orderChats(listed, chatPrefs, { includeArchived: true });
  const everywhere = ordered.filter((c) => !c.blocked && !prefsFor(chatPrefs, c.id).archived);
  const scope = folder ? ordered.filter((c) => inFolder(c, folder, context)) : everywhere;
  const unread = everywhere.filter((c) => isUnreadHere(c, context));

  const q = query.trim().toLowerCase();
  const include = (c: Chat) =>
    (!q ||
      titleOf(c).toLowerCase().includes(q) ||
      messagePreview(c.lastMessage).toLowerCase().includes(q)) &&
    (matchesFilter(c, filter, context) || (filter === 'unread' && held.has(c.id)));
  const rows =
    folder || q || crossesFolders(filter)
      ? scope.filter(include).map(chatRow)
      : chatListRows(ordered, include, isFolded, context);
  const networks = new Set(
    rows.flatMap((row) => (row.kind === 'chat' ? (networkOf(row.chat) ?? []) : []))
  );

  return {
    listed,
    requests,
    scope,
    rows,
    unseen: filter === 'unread' ? unread.filter((c) => !held.has(c.id)).map((c) => c.id) : [],
    unreadHere: unread.length,
    mentionsHere: everywhere.filter((c) => hasUnreadMentions(c, readAt)).length,
    showNetwork: !folder && networks.size > 1,
  };
}

import { orderConversations, type ChatPrefsMap } from '@/core/messaging/chat-prefs';
import {
  type ChatFilter,
  chatRow,
  type Directory,
  inboxRows,
  inDirectory,
  isUnreadHere,
  matchesFilter,
  networkOf,
} from '@/core/messaging/folders';
import { messagePreview } from '@/core/messaging/preview';
import type { Conversation, ConversationId } from '@/core/messaging/types';
import { hasUnreadMentions } from '@/core/messaging/unread';
import { protocolById } from '@/protocols';

export const isFolded = (network: string) => protocolById(network)?.external ?? true;

export function inbox({
  conversations,
  chatPrefs,
  readAt,
  directory,
  filter,
  query,
  held,
  titleOf,
}: {
  conversations: Conversation[];
  chatPrefs: ChatPrefsMap;
  readAt: Record<ConversationId, number>;
  directory: Directory | null;
  filter: ChatFilter;
  query: string;
  held: ReadonlySet<string>;
  titleOf: (c: Conversation) => string;
}) {
  const allowed = conversations.filter((c) => c.consent === 'allowed');
  const requests = conversations.filter((c) => c.consent === 'unknown');
  const context = { prefs: chatPrefs, readAt };
  const ordered = orderConversations(allowed, chatPrefs, { includeArchived: true });
  const scope = directory
    ? ordered.filter((c) => inDirectory(c, directory, context))
    : ordered.filter((c) => !chatPrefs[c.id]?.archived);
  const unread = scope.filter((c) => isUnreadHere(c, context));

  const q = query.trim().toLowerCase();
  const include = (c: Conversation) =>
    (!q ||
      titleOf(c).toLowerCase().includes(q) ||
      messagePreview(c.lastMessage).toLowerCase().includes(q)) &&
    (matchesFilter(c, filter, context) || (filter === 'unread' && held.has(c.id)));
  const nativeNetworks = new Set(
    scope.map(networkOf).filter((n): n is string => n !== undefined && !isFolded(n))
  );

  return {
    allowed,
    requests,
    scope,
    rows:
      directory || q
        ? scope.filter(include).map(chatRow)
        : inboxRows(ordered, include, isFolded, context),
    unseen: filter === 'unread' ? unread.filter((c) => !held.has(c.id)).map((c) => c.id) : [],
    unreadHere: unread.length,
    mentionsHere: scope.filter((c) => hasUnreadMentions(c, readAt)).length,
    showNetwork: !directory && nativeNetworks.size > 1,
  };
}

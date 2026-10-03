import { isLocalChat } from './bots';
import { type ChatPrefsMap, prefsFor } from './chat-prefs';
import { LOCAL_PROTOCOL } from './namespace';
import type { NetworkId } from './networks';
import { hasUnreadMentions, isUnread } from './unread';
import type { Chat, ChatId } from './types';

export type Folder = 'archive' | 'blocked' | NetworkId;

export type ChatFilter = 'all' | 'unread' | 'mentions' | 'dms' | 'groups';

export interface FilterContext {
  prefs: ChatPrefsMap;
  readAt: Record<ChatId, number>;
}

export type ChatListRow =
  | { kind: 'chat'; chat: Chat }
  | { kind: 'folder'; folder: Folder; latest: Chat; chats: Chat[] };

export function splitRequests(chats: readonly Chat[]): {
  accepted: Chat[];
  requests: Chat[];
  blocked: Chat[];
} {
  const split = { accepted: [] as Chat[], requests: [] as Chat[], blocked: [] as Chat[] };
  for (const chat of chats) {
    if (chat.blocked) split.blocked.push(chat);
    else if (chat.consent === 'accepted') split.accepted.push(chat);
    else if (chat.consent === 'request') split.requests.push(chat);
  }
  return split;
}

export function networkOf(chat: Chat): NetworkId | undefined {
  if (chat.protocol === LOCAL_PROTOCOL) return undefined;
  return chat.network ?? chat.protocol;
}

const chatRows = new WeakMap<Chat, ChatListRow>();

export function chatRow(chat: Chat): ChatListRow {
  let row = chatRows.get(chat);
  if (!row) {
    row = { kind: 'chat', chat };
    chatRows.set(chat, row);
  }
  return row;
}

export function isUnreadHere(chat: Chat, context: FilterContext): boolean {
  return !chat.blocked && !prefsFor(context.prefs, chat.id).muted && isUnread(chat, context.readAt);
}

/** Archived and blocked chats keep to their folder. */
function tucked(chat: Chat, prefs: ChatPrefsMap): boolean {
  return Boolean(chat.blocked || prefsFor(prefs, chat.id).archived);
}

export function matchesFilter(chat: Chat, filter: ChatFilter, context: FilterContext): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'unread':
      return isUnreadHere(chat, context);
    case 'mentions':
      return hasUnreadMentions(chat, context.readAt);
    case 'dms':
      return chat.kind === 'dm' && !isLocalChat(chat.id);
    case 'groups':
      return chat.kind === 'group' || chat.kind === 'channel';
  }
}

export function inFolder(chat: Chat, folder: Folder, context: FilterContext): boolean {
  if (folder === 'blocked') return Boolean(chat.blocked);
  if (folder === 'archive')
    return !chat.blocked && Boolean(prefsFor(context.prefs, chat.id).archived);
  return !tucked(chat, context.prefs) && networkOf(chat) === folder;
}

export function homeFolder(
  chat: Chat,
  prefs: ChatPrefsMap,
  folded: (network: NetworkId) => boolean
): Folder | null {
  if (chat.blocked) return 'blocked';
  const chatPrefs = prefsFor(prefs, chat.id);
  if (chatPrefs.archived) return 'archive';
  const network = networkOf(chat);
  return network && folded(network) && !chatPrefs.pinned ? network : null;
}

/** A pinned chat stays out of its folder, since pinning asks to see it. */
export function chatListRows(
  ordered: Chat[],
  include: (chat: Chat) => boolean,
  folded: (network: NetworkId) => boolean,
  context: FilterContext
): ChatListRow[] {
  const rows: ChatListRow[] = [];
  const folders = new Map<NetworkId, Extract<ChatListRow, { kind: 'folder' }>>();
  const folderRow = (folder: 'archive' | 'blocked'): ChatListRow[] => {
    const chats = ordered.filter((c) => include(c) && inFolder(c, folder, context));
    return chats.length > 0 ? [{ kind: 'folder', folder, latest: chats[0], chats }] : [];
  };

  rows.push(...folderRow('archive'));

  for (const chat of ordered) {
    const prefs = prefsFor(context.prefs, chat.id);
    if (tucked(chat, context.prefs) || !include(chat)) continue;
    const network = networkOf(chat);
    if (!network || !folded(network) || prefs.pinned) {
      rows.push(chatRow(chat));
      continue;
    }
    const existing = folders.get(network);
    if (existing) {
      existing.chats.push(chat);
      continue;
    }
    const row: Extract<ChatListRow, { kind: 'folder' }> = {
      kind: 'folder',
      folder: network,
      latest: chat,
      chats: [chat],
    };
    folders.set(network, row);
    rows.push(row);
  }
  rows.push(...folderRow('blocked'));
  return rows;
}

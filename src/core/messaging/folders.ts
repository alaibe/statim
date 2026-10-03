import { isLocalChat } from './bots';
import { type ChatPrefsMap, prefsFor } from './chat-prefs';
import { LOCAL_PROTOCOL } from './namespace';
import type { NetworkId } from './networks';
import { hasUnreadMentions, isSilenced, isUnread } from './unread';
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
  return !isSilenced(chat, context.prefs) && isUnread(chat, context.readAt);
}

/** Archived and blocked chats keep to a folder of their own; a blocked one stays in Blocked. */
export function ownFolder(chat: Chat, prefs: ChatPrefsMap): 'archive' | 'blocked' | null {
  if (chat.blocked) return 'blocked';
  return prefsFor(prefs, chat.id).archived ? 'archive' : null;
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
  const own = ownFolder(chat, context.prefs);
  return own ? own === folder : networkOf(chat) === folder;
}

/** A pinned chat stays out of its network's folder, since pinning asks to see it. */
export function homeFolder(
  chat: Chat,
  prefs: ChatPrefsMap,
  folded: (network: NetworkId) => boolean
): Folder | null {
  const own = ownFolder(chat, prefs);
  if (own) return own;
  const network = networkOf(chat);
  return network && folded(network) && !prefsFor(prefs, chat.id).pinned ? network : null;
}

/** Archive comes first and Blocked last; a network's folder sits where its latest chat would. */
export function chatListRows(
  ordered: Chat[],
  include: (chat: Chat) => boolean,
  folded: (network: NetworkId) => boolean,
  context: FilterContext
): ChatListRow[] {
  const rows: ChatListRow[] = [];
  const folders = new Map<Folder, Extract<ChatListRow, { kind: 'folder' }>>();
  for (const chat of ordered) {
    if (!include(chat)) continue;
    const folder = homeFolder(chat, context.prefs, folded);
    if (!folder) {
      rows.push(chatRow(chat));
      continue;
    }
    const existing = folders.get(folder);
    if (existing) {
      existing.chats.push(chat);
      continue;
    }
    const row: Extract<ChatListRow, { kind: 'folder' }> = {
      kind: 'folder',
      folder,
      latest: chat,
      chats: [chat],
    };
    folders.set(folder, row);
    if (folder !== 'archive' && folder !== 'blocked') rows.push(row);
  }
  const own = (folder: 'archive' | 'blocked') => {
    const row = folders.get(folder);
    return row ? [row] : [];
  };
  return [...own('archive'), ...rows, ...own('blocked')];
}

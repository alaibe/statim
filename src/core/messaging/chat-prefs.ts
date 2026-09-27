import type { AccountStorage } from '@/storage/account';
import type { Chat, ChatId } from './types';

export interface ChatPrefs {
  pinned?: boolean;
  muted?: boolean;
  archived?: boolean;
}

export type ChatPrefsMap = Record<ChatId, ChatPrefs>;

const KEY = 'chat.prefs';

export async function loadChatPrefs(storage: AccountStorage): Promise<ChatPrefsMap> {
  return (await storage.get<ChatPrefsMap>(KEY)) ?? {};
}

export async function saveChatPrefs(storage: AccountStorage, prefs: ChatPrefsMap): Promise<void> {
  try {
    await storage.set(KEY, prefs);
  } catch (error) {
    console.warn('[chat] could not persist chat preferences', error);
  }
}

export function withPref(
  prefs: ChatPrefsMap,
  id: ChatId,
  change: Partial<ChatPrefs>
): ChatPrefsMap {
  const next = { ...(prefs[id] ?? {}), ...change };

  const cleaned: ChatPrefs = {};
  if (next.pinned) cleaned.pinned = true;
  if (next.muted) cleaned.muted = true;
  if (next.archived) cleaned.archived = true;

  const out = { ...prefs };
  if (Object.keys(cleaned).length === 0) delete out[id];
  else out[id] = cleaned;
  return out;
}

export function orderChats(
  chats: Chat[],
  prefs: ChatPrefsMap,
  { includeArchived = false } = {}
): Chat[] {
  const recency = (c: Chat) => c.lastMessage?.sentAt ?? c.createdAt;

  return chats
    .filter((c) => includeArchived || !prefs[c.id]?.archived)
    .sort((a, b) => {
      const pinnedA = prefs[a.id]?.pinned ? 1 : 0;
      const pinnedB = prefs[b.id]?.pinned ? 1 : 0;
      if (pinnedA !== pinnedB) return pinnedB - pinnedA;
      return recency(b) - recency(a);
    });
}

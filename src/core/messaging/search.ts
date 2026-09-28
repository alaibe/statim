import { isLocalChat } from './bots';
import type { MessageStore } from './message-store';
import { namespaceMessage, protocolKeys, splitChatId, type ProtocolId } from './namespace';
import { contentPreview } from './preview';
import type { ChatSession } from './protocol';
import type { AnyChatId, ChatMessage, ChatId } from './types';

export const SEARCH_LIMIT = 100;

export function matchesSearch(message: ChatMessage<AnyChatId>, needle: string): boolean {
  return contentPreview(message.content).toLowerCase().includes(needle);
}

interface Searchable {
  messageStore: MessageStore | null;
  messages: Record<ChatId, readonly ChatMessage[]>;
  sessions: Partial<Record<ProtocolId, ChatSession>>;
}

export async function searchMessages(
  state: Searchable,
  query: string,
  id?: ChatId
): Promise<ChatMessage[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const split = id && !isLocalChat(id) ? splitChatId(id) : null;
  const store = state.messageStore;
  // Private notes sit under the namespaced id, protocol history under the native one.
  const local = store
    ? Promise.all([
        store.searchMessages(needle, split?.nativeId ?? id, split?.protocol),
        split ? store.searchMessages(needle, id) : [],
      ]).then((hits) => hits.flat())
    : Promise.resolve([]);
  const loaded = Object.entries(state.messages)
    .filter(([chatId]) => !id || chatId === id)
    .flatMap(([, messages]) => messages)
    .filter((message) => matchesSearch(message, needle));
  const protocols = id ? (split ? [split.protocol] : []) : protocolKeys(state.sessions);
  const remote = protocols.map(async (protocol) => {
    const session = state.sessions[protocol];
    if (!session?.searchMessages) return [];
    const found = await session
      .searchMessages(needle, id ? split?.nativeId : undefined)
      .catch((error: unknown) => {
        console.warn(`[chat] ${protocol} search failed`, error);
        return [];
      });
    return found.map((message) => namespaceMessage(protocol, message));
  });
  const stored = (await local).map((hit) =>
    hit.protocolId === undefined ? hit.message : namespaceMessage(hit.protocolId, hit.message)
  );
  const results = [...stored, ...loaded, ...(await Promise.all(remote)).flat()].filter(
    (message) => !id || message.chatId === id
  );
  const unique = new Map(results.map((message) => [`${message.chatId}:${message.id}`, message]));
  return [...unique.values()].sort((a, b) => b.sentAt - a.sentAt).slice(0, SEARCH_LIMIT);
}

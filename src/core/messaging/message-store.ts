import type {
  AnyChatId,
  ChatMessage,
  Chat,
  ChatId,
  MessageId,
  ParticipantId,
  ProtocolChatId,
  ProtocolMessage,
} from './types';
import { LOCAL_PROTOCOL, parseChatId, protocolChatId, type ProtocolId } from './namespace';
import { matchesSearch, SEARCH_LIMIT } from './search';
import { countsAsUnread } from './unread';

export interface StoredChat<Id extends AnyChatId = AnyChatId> {
  id: Id;
  protocolId: ProtocolId;
  participants: ParticipantId[];
  title?: string;
  createdAt: number;
  hidden: boolean;
  routingKey?: string;
}

export type TransportChat = StoredChat<ProtocolChatId>;

export type StoredSearchHit =
  | { message: ChatMessage; protocolId?: undefined }
  | { message: ProtocolMessage; protocolId: ProtocolId };

function appChatId(raw: string): ChatId {
  const id = parseChatId(raw);
  if (!id) throw new Error(`Stored chat id "${raw}" is not an app chat id.`);
  return id;
}

/** A transport's chats are stored under their protocol's ids; local chats and private notes under the app's. */
export function storedChatId<Id extends AnyChatId>(raw: string, protocolId: ProtocolId): Id {
  return (protocolId === LOCAL_PROTOCOL ? appChatId(raw) : protocolChatId(raw)) as Id;
}

export function searchHit(
  raw: string,
  protocolId: ProtocolId | undefined,
  message: <Id extends AnyChatId>(chatId: Id) => ChatMessage<Id>
): StoredSearchHit {
  if (!protocolId || protocolId === LOCAL_PROTOCOL) return { message: message(appChatId(raw)) };
  return { message: message(protocolChatId(raw)), protocolId };
}

export interface MessageStore {
  loadChats<Id extends AnyChatId>(protocolId: ProtocolId): Promise<StoredChat<Id>[]>;
  loadMessages<Id extends AnyChatId>(
    chatId: Id,
    limit?: number,
    before?: { sentAt: number; id: MessageId }
  ): Promise<ChatMessage<Id>[]>;
  searchMessages(
    query: string,
    chatId?: AnyChatId,
    protocolId?: ProtocolId
  ): Promise<StoredSearchHit[]>;
  countUnreadMessages(chatId: AnyChatId, since: number): Promise<number>;

  upsertChat(chat: StoredChat): Promise<void>;
  insertMessage<Id extends AnyChatId>(
    message: ChatMessage<Id>,
    chat?: StoredChat<Id>,
    transportTimestamp?: number
  ): Promise<boolean>;
  latestMessages<Id extends AnyChatId>(protocolId: ProtocolId): Promise<Map<Id, ChatMessage<Id>>>;
  newestTransportTimestamp(
    protocolId: ProtocolId,
    notAfter: number,
    chatId?: AnyChatId
  ): Promise<number | undefined>;
  clear(protocolId: ProtocolId): Promise<void>;
  cachedChats(): Promise<Chat[]>;
  cacheChats(keep: Chat[], drop: ChatId[]): Promise<void>;
}

export const HYDRATE_LIMIT = 500;

export class InMemoryMessageStore implements MessageStore {
  private readonly chats = new Map<AnyChatId, StoredChat>();
  private readonly messages = new Map<AnyChatId, Map<string, ChatMessage<AnyChatId>>>();

  async loadChats<Id extends AnyChatId>(protocolId: ProtocolId): Promise<StoredChat<Id>[]> {
    return [...this.chats.values()]
      .filter((c) => c.protocolId === protocolId)
      .map((c) => ({
        ...c,
        id: storedChatId<Id>(c.id, protocolId),
        participants: [...c.participants],
      }));
  }

  async loadMessages<Id extends AnyChatId>(
    chatId: Id,
    limit = HYDRATE_LIMIT,
    before?: { sentAt: number; id: MessageId }
  ): Promise<ChatMessage<Id>[]> {
    const byId = this.messages.get(chatId);
    if (!byId) return [];
    return [...byId.values()]
      .filter(
        (message): message is ChatMessage<Id> =>
          message.chatId === chatId &&
          (!before ||
            message.sentAt < before.sentAt ||
            (message.sentAt === before.sentAt && message.id < before.id))
      )
      .sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id))
      .slice(-limit);
  }

  async searchMessages(
    query: string,
    chatId?: AnyChatId,
    protocolId?: ProtocolId
  ): Promise<StoredSearchHit[]> {
    const needle = query.toLowerCase();
    return [...this.messages.entries()]
      .filter(
        ([id]) =>
          (!chatId || id === chatId) &&
          (!protocolId || this.chats.get(id)?.protocolId === protocolId)
      )
      .flatMap(([id, messages]) =>
        [...messages.values()].map((message) =>
          searchHit(id, this.chats.get(id)?.protocolId, (chatId) => ({ ...message, chatId }))
        )
      )
      .filter(({ message }) => matchesSearch(message, needle))
      .sort((a, b) => b.message.sentAt - a.message.sentAt)
      .slice(0, SEARCH_LIMIT);
  }

  async countUnreadMessages(chatId: AnyChatId, since: number): Promise<number> {
    return [...(this.messages.get(chatId)?.values() ?? [])].filter((message) =>
      countsAsUnread(message, since)
    ).length;
  }

  async upsertChat(chat: StoredChat): Promise<void> {
    this.chats.set(chat.id, {
      ...chat,
      participants: [...chat.participants],
    });
  }

  async insertMessage<Id extends AnyChatId>(
    message: ChatMessage<Id>,
    chat?: StoredChat<Id>,
    transportTimestamp?: number
  ): Promise<boolean> {
    let byId = this.messages.get(message.chatId);
    if (!byId) {
      byId = new Map();
      this.messages.set(message.chatId, byId);
    }
    const inserted = !byId.has(message.id);
    if (chat) await this.upsertChat(chat);
    if (inserted) byId.set(message.id, message);
    if (transportTimestamp !== undefined) {
      const current = this.transportTimestamps.get(message.chatId);
      if (current === undefined || transportTimestamp > current) {
        this.transportTimestamps.set(message.chatId, transportTimestamp);
      }
    }
    return inserted;
  }

  private readonly transportTimestamps = new Map<string, number>();

  async newestTransportTimestamp(
    protocolId: ProtocolId,
    notAfter: number,
    chatId?: AnyChatId
  ): Promise<number | undefined> {
    let newest: number | undefined;
    for (const chat of this.chats.values()) {
      if (chat.protocolId !== protocolId || (chatId && chat.id !== chatId)) continue;
      const timestamp = this.transportTimestamps.get(chat.id);
      if (
        timestamp !== undefined &&
        timestamp <= notAfter &&
        (newest === undefined || timestamp > newest)
      ) {
        newest = timestamp;
      }
    }
    return newest;
  }

  async latestMessages<Id extends AnyChatId>(
    protocolId: ProtocolId
  ): Promise<Map<Id, ChatMessage<Id>>> {
    const latest = new Map<Id, ChatMessage<Id>>();
    for (const chat of this.chats.values()) {
      if (chat.protocolId !== protocolId) continue;
      const id = storedChatId<Id>(chat.id, protocolId);
      const [newest] = await this.loadMessages(id, 1);
      if (newest) latest.set(id, newest);
    }
    return latest;
  }

  private readonly cached = new Map<ChatId, Chat>();

  async cachedChats(): Promise<Chat[]> {
    return [...this.cached.values()];
  }

  async cacheChats(keep: Chat[], drop: ChatId[]): Promise<void> {
    for (const chat of keep) this.cached.set(chat.id, chat);
    for (const id of drop) this.cached.delete(id);
  }

  async clear(protocolId: ProtocolId): Promise<void> {
    for (const [id, chat] of [...this.chats]) {
      if (chat.protocolId !== protocolId) continue;
      this.chats.delete(id);
      this.messages.delete(id);
      this.transportTimestamps.delete(id);
    }
  }
}

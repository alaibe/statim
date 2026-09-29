import { and, desc, eq, gt, inArray, lt, lte, notInArray, or, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import {
  HYDRATE_LIMIT,
  searchHit,
  storedChatId,
  type MessageStore,
  type StoredChat,
  type StoredSearchHit,
} from '@/core/messaging/message-store';
import { parseChatId, type ProtocolId } from '@/core/messaging/namespace';
import { matchesSearch, SEARCH_LIMIT } from '@/core/messaging/search';
import type {
  AnyChatId,
  ChatMessage,
  Chat,
  ChatId,
  MessageContent,
  MessageId,
} from '@/core/messaging/types';
import { isRecord, isString } from '@/lib/guards';
import { accountDatabaseGeneration, runAccountDatabaseOperation, type Database } from './database';
import { chatCache, chats, messages, transportCursors } from './schema';

type Queries = Pick<Database, 'insert'>;

export class SqliteMessageStore implements MessageStore {
  private readonly generation: number;

  constructor(private readonly accountId: string) {
    this.generation = accountDatabaseGeneration(accountId);
  }

  async loadChats<Id extends AnyChatId>(protocolId: ProtocolId): Promise<StoredChat<Id>[]> {
    const rows = await this.operation((db) =>
      db.select().from(chats).where(eq(chats.protocolId, protocolId))
    );
    return rows.map((row) => toChat<Id>(row));
  }

  async loadMessages<Id extends AnyChatId>(
    chatId: Id,
    limit = HYDRATE_LIMIT,
    before?: { sentAt: number; id: MessageId }
  ): Promise<ChatMessage<Id>[]> {
    const rows = await this.operation((db) =>
      db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.chatId, chatId),
            before
              ? or(
                  lt(messages.sentAt, before.sentAt),
                  and(eq(messages.sentAt, before.sentAt), lt(messages.id, before.id))
                )
              : undefined
          )
        )
        .orderBy(desc(messages.sentAt), desc(messages.id))
        .limit(limit)
    );
    return rows.map((row) => toMessage(row, chatId)).reverse();
  }

  async searchMessages(
    query: string,
    chatId?: AnyChatId,
    protocolId?: ProtocolId
  ): Promise<StoredSearchHit[]> {
    const rows = await this.operation((db) =>
      db
        .select({ message: messages, protocolId: chats.protocolId })
        .from(messages)
        .leftJoin(chats, eq(chats.id, messages.chatId))
        .where(
          and(
            sql`instr(lower(${messages.content}), lower(${query})) > 0`,
            chatId ? eq(messages.chatId, chatId) : undefined,
            protocolId ? eq(chats.protocolId, protocolId) : undefined
          )
        )
        .orderBy(desc(messages.sentAt))
    );
    const needle = query.toLowerCase();
    return rows
      .map(({ message, protocolId }) =>
        searchHit(message.chatId, protocolId ?? undefined, (id) => toMessage(message, id))
      )
      .filter(({ message }) => matchesSearch(message, needle))
      .slice(0, SEARCH_LIMIT);
  }

  countUnreadMessages(chatId: AnyChatId, since: number): Promise<number> {
    return this.operation((db) =>
      db.$count(
        messages,
        and(
          eq(messages.chatId, chatId),
          gt(messages.sentAt, since),
          eq(messages.fromMe, false),
          notInArray(sql`json_extract(${messages.content}, '$.kind')`, ['system', 'reaction'])
        )
      )
    );
  }

  async getMessage<Id extends AnyChatId>(
    chatId: Id,
    id: MessageId
  ): Promise<ChatMessage<Id> | null> {
    const row = await this.operation((db) =>
      db
        .select()
        .from(messages)
        .where(and(eq(messages.chatId, chatId), eq(messages.id, id)))
        .get()
    );
    return row ? toMessage(row, chatId) : null;
  }

  async updateMessage(message: ChatMessage<AnyChatId>): Promise<void> {
    await this.operation((db) =>
      db
        .update(messages)
        .set({ content: JSON.stringify(message.content), edited: message.edited ?? false })
        .where(and(eq(messages.chatId, message.chatId), eq(messages.id, message.id)))
    );
  }

  async deleteMessages(chatId: AnyChatId, ids: MessageId[]): Promise<void> {
    if (ids.length === 0) return;
    await this.operation((db) =>
      db.delete(messages).where(and(eq(messages.chatId, chatId), inArray(messages.id, ids)))
    );
  }

  async upsertChat(chat: StoredChat): Promise<void> {
    await this.operation((db) => upsertChat(db, chat));
  }

  insertMessage<Id extends AnyChatId>(
    message: ChatMessage<Id>,
    chat?: StoredChat<Id>,
    transportTimestamp?: number
  ): Promise<boolean> {
    if (!chat) return this.operation((db) => insertMessage(db, message));
    return this.operation((db) =>
      db.transaction(async (tx) => {
        await upsertChat(tx, chat);
        const inserted = await insertMessage(tx, message);
        if (transportTimestamp !== undefined) {
          await tx
            .insert(transportCursors)
            .values({ protocolId: chat.protocolId, chatId: chat.id, timestamp: transportTimestamp })
            .onConflictDoUpdate({
              target: [transportCursors.protocolId, transportCursors.chatId],
              set: {
                timestamp: sql`max(${transportCursors.timestamp}, ${excluded(transportCursors.timestamp)})`,
              },
            });
        }
        return inserted;
      })
    );
  }

  async latestMessages<Id extends AnyChatId>(
    protocolId: ProtocolId
  ): Promise<Map<Id, ChatMessage<Id>>> {
    const rows = await this.operation((db) => {
      const newest = db
        .select({ rowid: sql`rowid` })
        .from(messages)
        .where(eq(messages.chatId, chats.id))
        .orderBy(desc(messages.sentAt), desc(messages.id))
        .limit(1);
      return db
        .select({ message: messages })
        .from(chats)
        .innerJoin(messages, sql`${messages}.rowid = (${newest})`)
        .where(eq(chats.protocolId, protocolId));
    });
    return new Map(
      rows.map(({ message }) => {
        const chatId = storedChatId<Id>(message.chatId, protocolId);
        return [chatId, toMessage(message, chatId)] as const;
      })
    );
  }

  async newestTransportTimestamp(
    protocolId: ProtocolId,
    notAfter: number,
    chatId?: AnyChatId
  ): Promise<number | undefined> {
    const upperBound = Number.isFinite(notAfter) ? notAfter : Number.MAX_SAFE_INTEGER;
    const row = await this.operation((db) =>
      db
        .select({ timestamp: transportCursors.timestamp })
        .from(transportCursors)
        .where(
          and(
            eq(transportCursors.protocolId, protocolId),
            lte(transportCursors.timestamp, upperBound),
            chatId ? eq(transportCursors.chatId, chatId) : undefined
          )
        )
        .orderBy(desc(transportCursors.timestamp))
        .limit(1)
        .get()
    );
    return row?.timestamp;
  }

  async clear(protocolId: ProtocolId): Promise<void> {
    await this.operation((db) =>
      db.transaction(async (tx) => {
        const protocolChats = tx
          .select({ id: chats.id })
          .from(chats)
          .where(eq(chats.protocolId, protocolId));
        await tx.delete(messages).where(inArray(messages.chatId, protocolChats));
        await tx.delete(transportCursors).where(eq(transportCursors.protocolId, protocolId));
        await tx.delete(chats).where(eq(chats.protocolId, protocolId));
      })
    );
  }

  async cachedChats(): Promise<Chat[]> {
    const rows = await this.operation((db) => db.select({ data: chatCache.data }).from(chatCache));
    return rows.flatMap(({ data }) => {
      try {
        const chat: unknown = JSON.parse(data);
        return isCachedChat(chat) ? [chat] : [];
      } catch {
        return [];
      }
    });
  }

  async cacheChats(keep: Chat[], drop: ChatId[]): Promise<void> {
    await this.operation((db) =>
      db.transaction(async (tx) => {
        for (const rows of chunks(keep, CACHE_ROWS_PER_STATEMENT)) {
          await tx
            .insert(chatCache)
            .values(rows.map((chat) => ({ id: chat.id, data: JSON.stringify(chat) })))
            .onConflictDoUpdate({ target: chatCache.id, set: { data: excluded(chatCache.data) } });
        }
        for (const ids of chunks(drop, CACHE_ROWS_PER_STATEMENT)) {
          await tx.delete(chatCache).where(inArray(chatCache.id, ids));
        }
      })
    );
  }

  private operation<T>(work: (db: Database) => Promise<T>): Promise<T> {
    return runAccountDatabaseOperation(this.accountId, this.generation, work);
  }
}

/** The value an upsert would have inserted, in its `set`. */
function excluded(column: SQLiteColumn) {
  return sql.raw(`excluded.${column.name}`);
}

function upsertChat(db: Queries, chat: StoredChat) {
  const fields = {
    participants: chat.participants,
    title: chat.title ?? null,
    createdAt: chat.createdAt,
    hidden: chat.hidden,
    routingKey: chat.routingKey ?? null,
  };
  return db
    .insert(chats)
    .values({ id: chat.id, protocolId: chat.protocolId, ...fields })
    .onConflictDoUpdate({ target: chats.id, set: fields });
}

async function insertMessage(db: Queries, message: ChatMessage<AnyChatId>): Promise<boolean> {
  const inserted = await db
    .insert(messages)
    .values({
      id: message.id,
      chatId: message.chatId,
      senderId: message.senderId,
      sentAt: message.sentAt,
      fromMe: message.fromMe,
      status: message.status,
      content: JSON.stringify(message.content),
      replyTo: message.replyTo ?? null,
      edited: message.edited ?? false,
    })
    .onConflictDoNothing({ target: [messages.chatId, messages.id] })
    .returning({ id: messages.id });
  return inserted.length === 1;
}

function toChat<Id extends AnyChatId>(row: typeof chats.$inferSelect): StoredChat<Id> {
  return {
    id: storedChatId<Id>(row.id, row.protocolId),
    protocolId: row.protocolId,
    participants: row.participants,
    title: row.title ?? undefined,
    createdAt: row.createdAt,
    hidden: row.hidden,
    routingKey: row.routingKey ?? undefined,
  };
}

function isCachedChat(value: unknown): value is Chat {
  return isRecord(value) && isString(value.id) && parseChatId(value.id) !== null;
}

function toMessage<Id extends AnyChatId>(
  row: typeof messages.$inferSelect,
  chatId: Id
): ChatMessage<Id> {
  return {
    id: row.id,
    chatId,
    senderId: row.senderId,
    sentAt: row.sentAt,
    content: parseContent(row.content),
    fromMe: row.fromMe,
    status: row.status,
    replyTo: row.replyTo ?? undefined,
    privateToMe: (row.senderId === 'local' && row.id.startsWith('private:')) || undefined,
    edited: row.edited || undefined,
  };
}

function parseContent(raw: string): MessageContent {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.kind === 'string') {
      return parsed as MessageContent;
    }
  } catch {}
  return {
    kind: 'unsupported',
    typeId: 'unknown',
    fallback: 'This message could not be read.',
  };
}

const CACHE_ROWS_PER_STATEMENT = 300;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

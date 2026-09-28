import { HYDRATE_LIMIT } from '@/core/messaging/message-store';
import { parseChatId, type ProtocolId } from '@/core/messaging/namespace';
import { matchesSearch, SEARCH_LIMIT } from '@/core/messaging/search';
import {
  searchHit,
  storedChatId,
  type MessageStore,
  type StoredChat,
  type StoredSearchHit,
} from '@/core/messaging/message-store';
import type {
  AnyChatId,
  ChatMessage,
  Chat,
  ChatId,
  DeliveryStatus,
  MessageContent,
  MessageId,
} from '@/core/messaging/types';
import { isRecord, isString } from '@/lib/guards';
import {
  accountDatabaseGeneration,
  openAccountDatabase,
  runAccountDatabaseOperation,
} from './database';

type Database = Awaited<ReturnType<typeof openAccountDatabase>>;

interface ChatRow {
  id: string;
  protocol_id: ProtocolId;
  participants: string;
  title: string | null;
  created_at: number;
  hidden: number;
  routing_key: string | null;
}

interface MessageRow {
  id: string;
  chat_id: string;
  sender_id: string;
  sent_at: number;
  from_me: number;
  status: DeliveryStatus;
  content: string;
  reply_to: string | null;
}

export class SqliteMessageStore implements MessageStore {
  private readonly generation: number;

  constructor(private readonly accountId: string) {
    this.generation = accountDatabaseGeneration(accountId);
  }

  async loadChats<Id extends AnyChatId>(protocolId: ProtocolId): Promise<StoredChat<Id>[]> {
    const rows = await this.operation((db) =>
      db.getAllAsync<ChatRow>('SELECT * FROM chats WHERE protocol_id = ?', protocolId)
    );
    return rows.map((row) => toChat<Id>(row));
  }

  async loadMessages<Id extends AnyChatId>(
    chatId: Id,
    limit = HYDRATE_LIMIT,
    before?: { sentAt: number; id: MessageId }
  ): Promise<ChatMessage<Id>[]> {
    const rows = await this.operation((db) =>
      before
        ? db.getAllAsync<MessageRow>(
            `SELECT * FROM messages
           WHERE chat_id = ? AND (sent_at < ? OR (sent_at = ? AND id < ?))
           ORDER BY sent_at DESC, id DESC LIMIT ?`,
            chatId,
            before.sentAt,
            before.sentAt,
            before.id,
            limit
          )
        : db.getAllAsync<MessageRow>(
            'SELECT * FROM messages WHERE chat_id = ? ORDER BY sent_at DESC, id DESC LIMIT ?',
            chatId,
            limit
          )
    );

    return rows.map((row) => toMessage(row, chatId)).reverse();
  }

  async searchMessages(
    query: string,
    chatId?: AnyChatId,
    protocolId?: ProtocolId
  ): Promise<StoredSearchHit[]> {
    const rows = await this.operation((db) =>
      db.getAllAsync<MessageRow & { protocol_id: ProtocolId | null }>(
        `SELECT m.*, c.protocol_id FROM messages m
         LEFT JOIN chats c ON c.id = m.chat_id
         WHERE instr(lower(m.content), lower(?)) > 0
           AND (? IS NULL OR m.chat_id = ?)
           AND (? IS NULL OR c.protocol_id = ?)
         ORDER BY m.sent_at DESC`,
        query,
        chatId ?? null,
        chatId ?? null,
        protocolId ?? null,
        protocolId ?? null
      )
    );
    const needle = query.toLowerCase();
    return rows
      .map((row) =>
        searchHit(row.chat_id, row.protocol_id ?? undefined, (id) => toMessage(row, id))
      )
      .filter(({ message }) => matchesSearch(message, needle))
      .slice(0, SEARCH_LIMIT);
  }

  async countUnreadMessages(chatId: AnyChatId, since: number): Promise<number> {
    const row = await this.operation((db) =>
      db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM messages
         WHERE chat_id = ? AND sent_at > ? AND from_me = 0
           AND json_extract(content, '$.kind') NOT IN ('system', 'reaction')`,
        chatId,
        since
      )
    );
    return row?.count ?? 0;
  }

  async upsertChat(chat: StoredChat): Promise<void> {
    await this.write(async (db) => {
      await upsertChat(db, chat);
    });
  }

  async insertMessage<Id extends AnyChatId>(
    message: ChatMessage<Id>,
    chat?: StoredChat<Id>,
    transportTimestamp?: number
  ): Promise<boolean> {
    if (!chat) return this.write((db) => insertMessage(db, message));
    return this.transaction(async (db) => {
      await upsertChat(db, chat);
      const inserted = await insertMessage(db, message);
      if (transportTimestamp !== undefined) {
        await db.runAsync(
          `INSERT INTO transport_cursors (protocol_id, chat_id, timestamp)
             VALUES (?, ?, ?)
             ON CONFLICT(protocol_id, chat_id) DO UPDATE SET
               timestamp = MAX(timestamp, excluded.timestamp)`,
          chat.protocolId,
          chat.id,
          transportTimestamp
        );
      }
      return inserted;
    });
  }

  async latestMessages<Id extends AnyChatId>(
    protocolId: ProtocolId
  ): Promise<Map<Id, ChatMessage<Id>>> {
    const rows = await this.operation((db) =>
      db.getAllAsync<MessageRow>(
        `SELECT m.* FROM chats c
       JOIN messages m ON m.rowid = (
         SELECT rowid FROM messages
         WHERE chat_id = c.id
         ORDER BY sent_at DESC, id DESC LIMIT 1
       )
       WHERE c.protocol_id = ?`,
        protocolId
      )
    );
    return new Map(
      rows.map((row) => {
        const chatId = storedChatId<Id>(row.chat_id, protocolId);
        return [chatId, toMessage(row, chatId)] as const;
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
      db.getFirstAsync<{ timestamp: number }>(
        `SELECT timestamp FROM transport_cursors
       WHERE protocol_id = ? AND timestamp <= ? AND (? IS NULL OR chat_id = ?)
       ORDER BY timestamp DESC LIMIT 1`,
        protocolId,
        upperBound,
        chatId ?? null,
        chatId ?? null
      )
    );
    return row?.timestamp;
  }

  async clear(protocolId: ProtocolId): Promise<void> {
    await this.transaction(async (db) => {
      await db.runAsync(
        `DELETE FROM messages WHERE chat_id IN
           (SELECT id FROM chats WHERE protocol_id = ?)`,
        protocolId
      );
      await db.runAsync('DELETE FROM transport_cursors WHERE protocol_id = ?', protocolId);
      await db.runAsync('DELETE FROM chats WHERE protocol_id = ?', protocolId);
    });
  }

  async cachedChats(): Promise<Chat[]> {
    const rows = await this.operation((db) =>
      db.getAllAsync<{ data: string }>('SELECT data FROM chat_cache')
    );
    return rows.flatMap((row) => {
      try {
        const chat: unknown = JSON.parse(row.data);
        return isCachedChat(chat) ? [chat] : [];
      } catch {
        return [];
      }
    });
  }

  async cacheChats(keep: Chat[], drop: ChatId[]): Promise<void> {
    await this.transaction(async (db) => {
      for (const rows of chunks(keep, CACHE_ROWS_PER_STATEMENT)) {
        await db.runAsync(
          `INSERT INTO chat_cache (id, data)
             VALUES ${rows.map(() => '(?, ?)').join(', ')}
             ON CONFLICT(id) DO UPDATE SET data = excluded.data`,
          ...rows.flatMap((chat) => [chat.id, JSON.stringify(chat)])
        );
      }
      for (const ids of chunks(drop, CACHE_ROWS_PER_STATEMENT)) {
        await db.runAsync(
          `DELETE FROM chat_cache WHERE id IN (${ids.map(() => '?').join(', ')})`,
          ...ids
        );
      }
    });
  }

  private transaction<T>(work: (db: Database) => Promise<T>): Promise<T> {
    return this.write(async (db) => {
      let result!: T;
      await db.withExclusiveTransactionAsync(async (transaction) => {
        result = await work(transaction as Database);
      });
      return result;
    });
  }

  private async write<T>(work: (db: Database) => Promise<T>) {
    return this.operation(work);
  }

  private operation<T>(work: (db: Database) => Promise<T>): Promise<T> {
    return runAccountDatabaseOperation(this.accountId, this.generation, work);
  }
}

async function upsertChat(db: Database, chat: StoredChat): Promise<void> {
  await db.runAsync(
    `INSERT INTO chats
         (id, protocol_id, participants, title, created_at, hidden, routing_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         participants = excluded.participants,
         title        = excluded.title,
         created_at   = excluded.created_at,
         hidden       = excluded.hidden,
         routing_key  = excluded.routing_key`,
    chat.id,
    chat.protocolId,
    JSON.stringify(chat.participants),
    chat.title ?? null,
    chat.createdAt,
    chat.hidden ? 1 : 0,
    chat.routingKey ?? null
  );
}

async function insertMessage(db: Database, message: ChatMessage<AnyChatId>): Promise<boolean> {
  const result = await db.runAsync(
    `INSERT INTO messages
         (id, chat_id, sender_id, sent_at, from_me, status, content, reply_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, id) DO NOTHING`,
    message.id,
    message.chatId,
    message.senderId,
    message.sentAt,
    message.fromMe ? 1 : 0,
    message.status,
    JSON.stringify(message.content),
    message.replyTo ?? null
  );
  return result.changes === 1;
}

function toChat<Id extends AnyChatId>(row: ChatRow): StoredChat<Id> {
  return {
    id: storedChatId<Id>(row.id, row.protocol_id),
    protocolId: row.protocol_id,
    participants: parseArray(row.participants),
    title: row.title ?? undefined,
    createdAt: row.created_at,
    hidden: row.hidden === 1,
    routingKey: row.routing_key ?? undefined,
  };
}

function isCachedChat(value: unknown): value is Chat {
  return isRecord(value) && isString(value.id) && parseChatId(value.id) !== null;
}

function toMessage<Id extends AnyChatId>(row: MessageRow, chatId: Id): ChatMessage<Id> {
  return {
    id: row.id,
    chatId,
    senderId: row.sender_id,
    sentAt: row.sent_at,
    content: parseContent(row.content),
    fromMe: row.from_me === 1,
    status: row.status,
    replyTo: row.reply_to ?? undefined,
    privateToMe: (row.sender_id === 'local' && row.id.startsWith('private:')) || undefined,
  };
}

function parseArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

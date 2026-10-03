import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ProtocolId } from '@/core/messaging/namespace';
import type { DeliveryStatus, ParticipantId } from '@/core/messaging/types';

export const chats = sqliteTable(
  'chats',
  {
    id: text('id').primaryKey(),
    protocolId: text('protocol_id').$type<ProtocolId>().notNull(),
    participants: text('participants', { mode: 'json' }).$type<ParticipantId[]>().notNull(),
    title: text('title'),
    createdAt: integer('created_at').notNull(),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    blocked: integer('blocked', { mode: 'boolean' }).notNull().default(false),
    routingKey: text('routing_key'),
  },
  (table) => [index('chats_by_protocol').on(table.protocolId)]
);

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').notNull(),
    chatId: text('chat_id').notNull(),
    senderId: text('sender_id').notNull(),
    sentAt: integer('sent_at').notNull(),
    fromMe: integer('from_me', { mode: 'boolean' }).notNull().default(false),
    status: text('status').$type<DeliveryStatus>().notNull().default('sent'),
    content: text('content').notNull(),
    replyTo: text('reply_to'),
    edited: integer('edited', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.id] }),
    // Every read is "the newest N in this chat, oldest first".
    index('messages_by_chat').on(table.chatId, table.sentAt),
  ]
);

export const transportCursors = sqliteTable(
  'transport_cursors',
  {
    protocolId: text('protocol_id').$type<ProtocolId>().notNull(),
    chatId: text('chat_id').notNull(),
    timestamp: integer('timestamp').notNull(),
  },
  (table) => [primaryKey({ columns: [table.protocolId, table.chatId] })]
);

export const chatCache = sqliteTable('chat_cache', {
  id: text('id').primaryKey(),
  data: text('data').notNull(),
});

export const protocolState = sqliteTable(
  'protocol_state',
  {
    protocolId: text('protocol_id').$type<ProtocolId>().notNull(),
    key: text('key').notNull(),
    value: text('value', { mode: 'json' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.protocolId, table.key] })]
);

export const accountState = sqliteTable('account_state', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});

import type { MigrationMeta } from 'drizzle-orm/migrator';

export const MIGRATIONS: MigrationMeta[] = [
  {
    "sql": [
      "CREATE TABLE `chat_cache` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`data` text NOT NULL\n);\n",
      "\nCREATE TABLE `chats` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`protocol_id` text NOT NULL,\n\t`participants` text NOT NULL,\n\t`title` text,\n\t`created_at` integer NOT NULL,\n\t`hidden` integer DEFAULT false NOT NULL,\n\t`routing_key` text\n);\n",
      "\nCREATE INDEX `chats_by_protocol` ON `chats` (`protocol_id`);",
      "\nCREATE TABLE `messages` (\n\t`id` text NOT NULL,\n\t`chat_id` text NOT NULL,\n\t`sender_id` text NOT NULL,\n\t`sent_at` integer NOT NULL,\n\t`from_me` integer DEFAULT false NOT NULL,\n\t`status` text DEFAULT 'sent' NOT NULL,\n\t`content` text NOT NULL,\n\t`reply_to` text,\n\t`edited` integer DEFAULT false NOT NULL,\n\tPRIMARY KEY(`chat_id`, `id`)\n);\n",
      "\nCREATE INDEX `messages_by_chat` ON `messages` (`chat_id`,`sent_at`);",
      "\nCREATE TABLE `protocol_state` (\n\t`protocol_id` text NOT NULL,\n\t`key` text NOT NULL,\n\t`value` text NOT NULL,\n\tPRIMARY KEY(`protocol_id`, `key`)\n);\n",
      "\nCREATE TABLE `transport_cursors` (\n\t`protocol_id` text NOT NULL,\n\t`chat_id` text NOT NULL,\n\t`timestamp` integer NOT NULL,\n\tPRIMARY KEY(`protocol_id`, `chat_id`)\n);\n"
    ],
    "bps": true,
    "folderMillis": 1790668752829,
    "hash": "bab0b03a38076ed8886cf05bdc20b963d884b2dd1481f1b66210bb9eaf67a940"
  },
  {
    "sql": [
      "CREATE TABLE `account_state` (\n\t`key` text PRIMARY KEY NOT NULL,\n\t`value` text NOT NULL\n);\n"
    ],
    "bps": true,
    "folderMillis": 1790699492896,
    "hash": "8bb5823f055711341690508ba7becae6cabc95cd037de091acded0165a614c8c"
  },
  {
    "sql": [
      "ALTER TABLE `chats` ADD `blocked` integer DEFAULT false NOT NULL;"
    ],
    "bps": true,
    "folderMillis": 1791011579306,
    "hash": "6db38086da10d370cee0984586ccd440002e1a02af9cf3295ac0de9f56705a92"
  }
];

CREATE TABLE `chat_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`protocol_id` text NOT NULL,
	`participants` text NOT NULL,
	`title` text,
	`created_at` integer NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`routing_key` text
);
--> statement-breakpoint
CREATE INDEX `chats_by_protocol` ON `chats` (`protocol_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text NOT NULL,
	`chat_id` text NOT NULL,
	`sender_id` text NOT NULL,
	`sent_at` integer NOT NULL,
	`from_me` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'sent' NOT NULL,
	`content` text NOT NULL,
	`reply_to` text,
	`edited` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`chat_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `messages_by_chat` ON `messages` (`chat_id`,`sent_at`);--> statement-breakpoint
CREATE TABLE `protocol_state` (
	`protocol_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`protocol_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `transport_cursors` (
	`protocol_id` text NOT NULL,
	`chat_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	PRIMARY KEY(`protocol_id`, `chat_id`)
);

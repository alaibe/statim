import type { AccountStorage } from '@/storage/account';
import { canBeUnread } from './message-rules';
import { MARKED_UNREAD } from './unread';
import type { ChatId, ChatMessage, MessageId } from './types';

/**
 * Opening a chat reads its timeline but not its threads, so a chat with threads
 * keeps the read time its threads had before: `since` for every thread, or the
 * time a thread was last opened.
 */
export interface ThreadReads {
  readonly since: number;
  readonly threads: Readonly<Record<MessageId, number>>;
}

export type ThreadReadState = Readonly<Record<ChatId, ThreadReads>>;

const KEY = 'chat.threadReads';

export async function loadThreadReads(storage: AccountStorage): Promise<ThreadReadState> {
  return (await storage.get<ThreadReadState>(KEY)) ?? {};
}

export async function saveThreadReads(
  storage: AccountStorage,
  state: ThreadReadState
): Promise<void> {
  try {
    await storage.set(KEY, state);
  } catch (error) {
    console.warn('[chat] could not save thread read state', error);
  }
}

/** The thread reads to keep before a chat's read time moves from `previous`. */
export function keepThreadReads(
  state: ThreadReadState,
  id: ChatId,
  previous: number | undefined
): ThreadReadState {
  if (state[id] || previous === undefined || previous === MARKED_UNREAD) return state;
  return { ...state, [id]: { since: previous, threads: {} } };
}

export function withThreadRead(
  state: ThreadReadState,
  id: ChatId,
  root: MessageId,
  readAt: number | undefined,
  now: number
): ThreadReadState {
  const reads = state[id] ?? { since: Math.max(readAt ?? 0, 0), threads: {} };
  return { ...state, [id]: { ...reads, threads: { ...reads.threads, [root]: now } } };
}

export function threadReadAt(
  reads: ThreadReads | undefined,
  readAt: number | undefined,
  root: MessageId
): number {
  return reads?.threads[root] ?? reads?.since ?? Math.max(readAt ?? 0, 0);
}

export function isNewReply(message: ChatMessage, since: number): boolean {
  return canBeUnread(message) && message.sentAt > since;
}

/** Replies not yet seen in each thread, by the message that started it. */
export function newReplyCounts(
  messages: readonly ChatMessage[],
  reads: ThreadReads | undefined,
  readAt: number | undefined
): Map<MessageId, number> {
  const counts = new Map<MessageId, number>();
  for (const message of messages) {
    const root = message.threadRoot;
    if (root && isNewReply(message, threadReadAt(reads, readAt, root))) {
      counts.set(root, (counts.get(root) ?? 0) + 1);
    }
  }
  return counts;
}

import { withPosition } from './chats';
import type { TdChat, TdChatUpdate } from './types';

export function patchChat(chat: TdChat, update: TdChatUpdate): void {
  switch (update['@type']) {
    case 'updateChatPosition':
      chat.positions = withPosition(chat.positions, update.position);
      return;
    case 'updateChatTitle':
      chat.title = update.title;
      return;
    case 'updateChatPhoto':
      chat.photo = update.photo;
      return;
    case 'updateChatLastMessage':
      chat.last_message = update.last_message ?? undefined;
      chat.positions = update.positions;
      return;
    case 'updateChatReadInbox':
      chat.unread_count = update.unread_count;
      return;
    case 'updateChatReadOutbox':
      chat.last_read_outbox_message_id = update.last_read_outbox_message_id;
      return;
    case 'updateChatUnreadMentionCount':
      chat.unread_mention_count = update.unread_mention_count;
      return;
    case 'updateChatPendingJoinRequests':
      chat.pending_join_requests = update.pending_join_requests;
      return;
    case 'updateChatDraftMessage':
      chat.draft_message = update.draft_message;
      chat.positions = update.positions;
      return;
    case 'updateChatIsMarkedAsUnread':
      chat.is_marked_as_unread = update.is_marked_as_unread;
      return;
    case 'updateChatPermissions':
      chat.permissions = update.permissions;
      return;
    case 'updateChatBlockList':
      chat.block_list = update.block_list;
      return;
  }
}

const TYPING_TIMEOUT_MS = 6_000;

/** A start with no stop lapses on its own, as the Telegram apps treat it. */
export class TypingTracker {
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(private readonly onLapse: (chatId: number) => void) {}

  isTyping(chatId: number): boolean {
    return this.timers.has(chatId);
  }

  set(chatId: number, typing: boolean): void {
    clearTimeout(this.timers.get(chatId));
    this.timers.delete(chatId);
    if (!typing) return;
    this.timers.set(
      chatId,
      setTimeout(() => {
        this.timers.delete(chatId);
        this.onLapse(chatId);
      }, TYPING_TIMEOUT_MS)
    );
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}

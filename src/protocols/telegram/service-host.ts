import type { ProtocolMessage, ProtocolChat } from '@/core/messaging/types';

import type { TdApi } from './api';
import type { TdDirectory } from './directory';
import type { TdChat, TdMessage } from './types';

export interface TelegramHost {
  api(): TdApi;
  readonly td: TdDirectory;
  toChat(chat: TdChat): ProtocolChat;
  selfUserId(): number | undefined;
  toMessage(raw: TdMessage, fetchMedia: boolean): ProtocolMessage;
  refetch(chatId: number, messageId: number): Promise<void>;
  emitMessage(raw: TdMessage): Promise<void>;
}

import type { AnyChatId, ChatMessage, MessageContent } from './types';

export const NON_PREVIEW_KINDS: readonly MessageContent['kind'][] = ['reaction'];
const LINE_KINDS: readonly MessageContent['kind'][] = ['system', 'call'];
export const NON_UNREAD_KINDS: readonly MessageContent['kind'][] = ['system', ...NON_PREVIEW_KINDS];

export function showsInPreview(message: Pick<ChatMessage<AnyChatId>, 'content'>): boolean {
  return !NON_PREVIEW_KINDS.includes(message.content.kind);
}

/** Drawn across the chat rather than in a sender's bubble. */
export function isLine(message: Pick<ChatMessage<AnyChatId>, 'content'>): boolean {
  return LINE_KINDS.includes(message.content.kind);
}

export function canBeUnread(message: Pick<ChatMessage<AnyChatId>, 'content' | 'fromMe'>): boolean {
  return !message.fromMe && !NON_UNREAD_KINDS.includes(message.content.kind);
}

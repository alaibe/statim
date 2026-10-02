import { useChatStore } from './chat-store';
import { nameFrom, resolveParticipants } from './display-names';
import { plainText } from './markdown';
import { contentPreview } from './preview';
import type { ChatId, MessageId } from './types';

/** A message reduced to who said what, for a model to read. */
export interface ChatLine {
  id: MessageId;
  /** The sender's name as the app shows it, or "You". */
  from: string;
  fromMe: boolean;
  sentAt: number;
  /** The text, or a one-line description of a photo, file or poll. */
  text: string;
}

/** The newest `limit` messages, oldest first, without private notices and reactions. */
export async function recentLines(chatId: ChatId, limit: number): Promise<ChatLine[]> {
  if (!useChatStore.getState().messages[chatId]) {
    await useChatStore.getState().loadMessages(chatId);
  }
  const store = useChatStore.getState();
  const chat = store.chats.find((c) => c.id === chatId);
  const picked = (store.messages[chatId] ?? [])
    .filter((m) => !m.privateToMe && !m.preview && m.content.kind !== 'reaction')
    .slice(-limit);
  const others = [...new Set(picked.filter((m) => !m.fromMe).map((m) => m.senderId))];
  const resolved = chat
    ? await resolveParticipants(chat.protocol, others)
    : { names: {}, addresses: {} };
  return picked.map((m) => ({
    id: m.id,
    from: m.fromMe ? 'You' : nameFrom(m.senderId, resolved),
    fromMe: m.fromMe,
    sentAt: m.sentAt,
    text: m.content.kind === 'text' ? plainText(m.content.text).trim() : contentPreview(m.content),
  }));
}

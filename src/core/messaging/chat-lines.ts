import { useChatStore } from './chat-store';
import { nameFrom, resolveParticipants } from './display-names';
import { plainText } from './markdown';
import { contentPreview } from './preview';
import type { ChatId } from './types';

export interface ChatLine {
  /** The sender's name as the app shows it, or "You". */
  from: string;
  fromMe: boolean;
  /** The text, or a one-line description of a photo, file or poll. */
  text: string;
  /** `text` describes what was sent instead of quoting what was written. */
  described: boolean;
}

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
    from: m.fromMe ? 'You' : nameFrom(m.senderId, resolved),
    fromMe: m.fromMe,
    text: m.content.kind === 'text' ? plainText(m.content.text).trim() : contentPreview(m.content),
    described: m.content.kind !== 'text',
  }));
}

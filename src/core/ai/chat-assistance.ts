import { isLocalChat } from '@/core/messaging/bots';
import { isChatLine, linesFromMessages, type ChatLine } from '@/core/messaging/chat-lines';
import { useChatStore } from '@/core/messaging/chat-store';
import { contentPreview } from '@/core/messaging/preview';
import type { Chat, ChatId, ChatMessage } from '@/core/messaging/types';

import { loadTypesafeKey, type AiConfig } from './config';
import { AiError } from './errors';
import { bareLine, completeOver, replyRequest, SUGGEST_CONTEXT, transcript } from './prompts';
import { resolveProvider } from './providers';
import { needsReply } from './reply-decision';

export const isAssistanceMessage = (message: ChatMessage) =>
  isChatLine(message) && !message.threadRoot && message.content.kind !== 'system';

export const canAssist = (chat: Chat) =>
  !isLocalChat(chat.id) &&
  chat.kind !== 'channel' &&
  chat.consent === 'accepted' &&
  !chat.blocked &&
  chat.canSend !== false;

export function replyTarget(messages: readonly ChatMessage[] | undefined): string | null {
  const message = messages?.findLast(isAssistanceMessage);
  return message && !message.fromMe ? `${message.id}\n${contentPreview(message.content)}` : null;
}

export async function assistanceLines(chatId: ChatId) {
  const picked = (useChatStore.getState().messages[chatId] ?? [])
    .filter(isAssistanceMessage)
    .slice(-SUGGEST_CONTEXT);
  return linesFromMessages(chatId, picked);
}

const decisions = new Map<string, { text: string; promise: Promise<boolean> }>();
useChatStore.subscribe((state, previous) => {
  if (state.accountId !== previous.accountId) decisions.clear();
});

export async function replyNeeded(
  accountId: string,
  chatId: ChatId,
  lines: readonly ChatLine[],
  signal?: AbortSignal
) {
  const key = await loadTypesafeKey(accountId);
  if (signal?.aborted) return false;
  if (!key) throw new AiError('unavailable', 'Enter a TypeSafe API key in Settings › AI.');
  const id = `${accountId}\n${chatId}`;
  const text = `${key}\n${replyTarget(useChatStore.getState().messages[chatId])}\n${transcript(lines, 12_000).text}`;
  const previous = decisions.get(id);
  if (previous?.text === text) return previous.promise;
  const promise = needsReply(lines, key);
  const entry = { text, promise };
  decisions.set(id, entry);
  if (decisions.size > 200) decisions.delete(decisions.keys().next().value!);
  try {
    return await promise;
  } catch (error) {
    if (decisions.get(id) === entry) decisions.delete(id);
    throw error;
  }
}

export async function prepareReply(
  accountId: string,
  chatId: ChatId,
  config: AiConfig,
  signal: AbortSignal
) {
  const lines = await assistanceLines(chatId);
  if (signal.aborted || !(await replyNeeded(accountId, chatId, lines, signal)) || signal.aborted)
    return null;
  const model = await resolveProvider(accountId, config);
  if (signal.aborted) return null;
  const text = bareLine((await completeOver(model, lines, replyRequest)).text);
  if (!text) throw new AiError('server', 'The model suggested nothing.');
  return signal.aborted ? null : { text, label: model.label };
}

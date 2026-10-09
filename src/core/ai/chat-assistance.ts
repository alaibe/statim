import { isChatLine, linesFromMessages, type ChatLine } from '@/core/messaging/chat-lines';
import { chatScope } from '@/core/messaging/chat-scope';
import { peekMessages, useChatStore } from '@/core/messaging/chat-store';
import { canSend } from '@/core/messaging/permissions';
import { contentPreview } from '@/core/messaging/preview';
import type { Chat, ChatId, ChatMessage } from '@/core/messaging/types';

import { usefulAction, type SuggestedAction } from './action-decision';
import { loadTypesafeKey, type AiConfig } from './config';
import { AiError } from './errors';
import { jevState } from './jev';
import { deviceLanguage } from './languages';
import { bareLine, completeOver, followUpRequest, replyRequest, SUGGEST_CONTEXT } from './prompts';
import { resolveProvider, type CompletionRequest } from './providers';
import { needsReply, type ReplyKind } from './reply-decision';

export const isAssistanceMessage = (message: ChatMessage) =>
  isChatLine(message) && !message.threadRoot && message.content.kind !== 'system';

export const canAssist = (chat: Chat) =>
  chat.consent === 'accepted' && chatScope(chat.id, chat.kind) !== 'channel' && canSend(chat);

export const latestIncoming = (messages: readonly ChatMessage[] | undefined) =>
  messages?.findLast((message) => isAssistanceMessage(message) && !message.fromMe);

export const messageKey = (message: ChatMessage) =>
  `${message.id}\n${contentPreview(message.content)}`;

const PEEK_LIMIT = 50;

export async function assistanceLines(chatId: ChatId) {
  const messages =
    useChatStore.getState().messages[chatId] ?? (await peekMessages(chatId, PEEK_LIMIT));
  const picked = messages.filter(isAssistanceMessage).slice(-SUGGEST_CONTEXT);
  return linesFromMessages(chatId, picked);
}

function decisionCache<T>() {
  const entries = new Map<string, { text: string; promise: Promise<T> }>();
  return {
    clear: () => entries.clear(),
    async get(
      accountId: string,
      id: string,
      text: string,
      signal: AbortSignal | undefined,
      ask: (key: string) => Promise<T>
    ): Promise<T | null> {
      const key = await loadTypesafeKey(accountId);
      if (signal?.aborted || useChatStore.getState().accountId !== accountId) return null;
      if (!key) throw new AiError('unavailable', 'Enter a TypeSafe API key in Settings › AI.');
      const previous = entries.get(id);
      if (previous?.text === text) return previous.promise;
      const entry = { text, promise: ask(key) };
      entries.set(id, entry);
      if (entries.size > 200) entries.delete(entries.keys().next().value!);
      try {
        return await entry.promise;
      } catch (error) {
        if (entries.get(id) === entry) entries.delete(id);
        throw error;
      }
    },
  };
}

const replies = decisionCache<boolean>();
const actions = decisionCache<SuggestedAction | null>();

export function clearDecisions() {
  replies.clear();
  actions.clear();
}

export async function replyNeeded(
  accountId: string,
  chatId: ChatId,
  lines: readonly ChatLine[],
  signal?: AbortSignal,
  kind: ReplyKind = 'reply'
) {
  const id = `${accountId}\n${chatId}\n${kind}`;
  const needed = await replies.get(accountId, id, jevState(lines), signal, (key) =>
    needsReply(lines, key, kind)
  );
  return needed === true;
}

export async function recommendAction(
  accountId: string,
  chatId: ChatId,
  signal: AbortSignal
): Promise<SuggestedAction | null> {
  const latest = latestIncoming(useChatStore.getState().messages[chatId]);
  if (!latest) return null;
  const lines = await assistanceLines(chatId);
  const language = deviceLanguage();
  const text = `${language.tag}\n${messageKey(latest)}`;
  return actions.get(accountId, `${accountId}\n${chatId}`, text, signal, (key) =>
    usefulAction(lines, key, language)
  );
}

const WRITE: Record<ReplyKind, (chat: string) => CompletionRequest> = {
  reply: replyRequest,
  'follow-up': followUpRequest,
};

export async function prepareReply(
  accountId: string,
  chatId: ChatId,
  config: AiConfig,
  signal: AbortSignal,
  kind: ReplyKind
) {
  const lines = await assistanceLines(chatId);
  if (!(await replyNeeded(accountId, chatId, lines, signal, kind)) || signal.aborted) return null;
  const model = await resolveProvider(accountId, config);
  if (signal.aborted) return null;
  const text = bareLine((await completeOver(model, lines, WRITE[kind])).text);
  if (!text) throw new AiError('server', 'The model suggested nothing.');
  return { text, label: model.label };
}

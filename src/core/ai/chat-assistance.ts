import { isLocalChat } from '@/core/messaging/bots';
import { isChatLine, linesFromMessages, type ChatLine } from '@/core/messaging/chat-lines';
import { useChatStore } from '@/core/messaging/chat-store';
import { contentPreview } from '@/core/messaging/preview';
import type { Chat, ChatId, ChatMessage } from '@/core/messaging/types';

import { usefulAction, type SuggestedAction } from './action-decision';
import { deviceLanguage } from './languages';
import { loadTypesafeKey, type AiConfig } from './config';
import { AiError } from './errors';
import {
  bareLine,
  completeOver,
  followUpRequest,
  replyRequest,
  SUGGEST_CONTEXT,
  transcript,
} from './prompts';
import { resolveProvider } from './providers';
import { needsReply, type ReplyKind } from './reply-decision';

export const isAssistanceMessage = (message: ChatMessage) =>
  isChatLine(message) && !message.threadRoot && message.content.kind !== 'system';

export const canAssist = (chat: Chat) =>
  !isLocalChat(chat.id) &&
  chat.kind !== 'channel' &&
  chat.consent === 'accepted' &&
  !chat.blocked &&
  chat.canSend !== false;

export function replyTarget(
  messages: readonly ChatMessage[] | undefined,
  kind: ReplyKind = 'reply'
): string | null {
  const message = messages?.findLast(isAssistanceMessage);
  const matches =
    message && (kind === 'reply' ? !message.fromMe : message.fromMe && message.status === 'sent');
  return matches ? `${message.id}\n${contentPreview(message.content)}` : null;
}

export async function assistanceLines(chatId: ChatId) {
  const picked = (useChatStore.getState().messages[chatId] ?? [])
    .filter(isAssistanceMessage)
    .slice(-SUGGEST_CONTEXT);
  return linesFromMessages(chatId, picked);
}

type Decision = ReplyKind | SuggestedAction | null;
const decisions = new Map<string, { text: string; promise: Promise<Decision> }>();
useChatStore.subscribe((state, previous) => {
  if (state.accountId !== previous.accountId) decisions.clear();
});

async function decisionFor(
  accountId: string,
  chatId: ChatId,
  lines: readonly ChatLine[],
  signal?: AbortSignal,
  kind: ReplyKind | 'action' = 'reply'
): Promise<Decision> {
  const key = await loadTypesafeKey(accountId);
  if (signal?.aborted || useChatStore.getState().accountId !== accountId) return null;
  if (!key) throw new AiError('unavailable', 'Enter a TypeSafe API key in Settings › AI.');
  const id = `${accountId}\n${chatId}\n${kind}`;
  const language = deviceLanguage();
  const last = useChatStore.getState().messages[chatId]?.findLast(isAssistanceMessage);
  const text = `${key}\n${last?.id}\n${language.tag}\n${transcript(lines, 12_000).text}`;
  const previous = decisions.get(id);
  if (previous?.text === text) return previous.promise;
  const promise =
    kind === 'action'
      ? usefulAction(lines, key, language)
      : (kind === 'reply' ? needsReply(lines, key) : needsReply(lines, key, kind)).then((needed) =>
          needed ? kind : null
        );
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

export async function replyNeeded(
  accountId: string,
  chatId: ChatId,
  lines: readonly ChatLine[],
  signal?: AbortSignal,
  kind: ReplyKind = 'reply'
) {
  return (await decisionFor(accountId, chatId, lines, signal, kind)) === kind;
}

export async function recommendAction(
  accountId: string,
  chatId: ChatId,
  signal: AbortSignal
): Promise<SuggestedAction | null> {
  const lines = await assistanceLines(chatId);
  if (signal.aborted) return null;
  const action = await decisionFor(accountId, chatId, lines, signal, 'action');
  return action === 'summarize' || action === 'translate' ? action : null;
}

export async function prepareReply(
  accountId: string,
  chatId: ChatId,
  config: AiConfig,
  signal: AbortSignal,
  kind: ReplyKind = 'reply'
) {
  const lines = await assistanceLines(chatId);
  if (
    signal.aborted ||
    !(await replyNeeded(accountId, chatId, lines, signal, kind)) ||
    signal.aborted
  )
    return null;
  const model = await resolveProvider(accountId, config);
  if (signal.aborted) return null;
  const text = bareLine(
    (await completeOver(model, lines, kind === 'follow-up' ? followUpRequest : replyRequest)).text
  );
  if (!text) throw new AiError('server', 'The model suggested nothing.');
  return signal.aborted ? null : { text, label: model.label, kind };
}

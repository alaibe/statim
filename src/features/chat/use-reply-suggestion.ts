import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';

import { loadAiConfig, loadTypesafeKey } from '@/core/ai/config';
import { AiError } from '@/core/ai/errors';
import { bareLine, completeOver, replyRequest, SUGGEST_CONTEXT } from '@/core/ai/prompts';
import { resolveProvider } from '@/core/ai/providers';
import { needsReply } from '@/core/ai/reply-decision';
import { useAppearanceStore } from '@/core/app/appearance';
import { errorMessage } from '@/core/errors';
import { isChatLine, linesFromMessages } from '@/core/messaging/chat-lines';
import { useChatStore } from '@/core/messaging/chat-store';
import { draftKey } from '@/core/messaging/drafts';
import { contentPreview } from '@/core/messaging/preview';
import type { ChatId, ChatMessage } from '@/core/messaging/types';

const relevant = (message: ChatMessage) =>
  isChatLine(message) && !message.threadRoot && message.content.kind !== 'system';

function replyTarget(messages: readonly ChatMessage[] | undefined): string | null {
  const message = messages?.findLast(relevant);
  return message && !message.fromMe ? `${message.id}\n${contentPreview(message.content)}` : null;
}

type Suggestion =
  | { status: 'pending'; label: string }
  | { status: 'ready'; text: string; label: string }
  | { status: 'error'; text: string };

export function useReplySuggestion(chatId: ChatId, available: boolean) {
  const focused = useIsFocused();
  const aiEnabled = useAppearanceStore((s) => s.aiInChats);
  const settingsAccountId = useAppearanceStore((s) => s.accountId);
  const accountId = useChatStore((s) => s.accountId);
  const draft = useChatStore((s) => s.drafts[draftKey(chatId)] ?? '');
  const messages = useChatStore((s) => s.messages[chatId]);
  const history = useChatStore((s) => s.messageHistory[chatId]);
  const target = replyTarget(messages);
  const key = accountId && target ? `${accountId}\n${chatId}\n${target}` : null;
  const enabled =
    focused &&
    aiEnabled &&
    settingsAccountId === accountId &&
    available &&
    history !== undefined &&
    !history.loading &&
    !history.error &&
    !draft;
  const [result, setResult] = useState<{ key: string; suggestion: Suggestion | null } | null>(null);
  const current = result?.key === key ? result.suggestion : null;
  const settled = result?.key === key && (current === null || current.status === 'ready');

  useEffect(() => {
    if (!enabled || !accountId || !key) return;
    let active = true;
    const show = (suggestion: Suggestion | null) => {
      if (active) setResult({ key, suggestion });
    };
    const run = async () => {
      const config = await loadAiConfig(accountId);
      if (!config.suggestOnOpen) return show(null);
      if (settled) return;
      const typesafeKey = await loadTypesafeKey(accountId);
      if (!typesafeKey) throw new Error('Enter a TypeSafe API key in Settings › AI.');
      show({ status: 'pending', label: 'Checking whether a reply is needed…' });
      const picked = (useChatStore.getState().messages[chatId] ?? [])
        .filter(relevant)
        .slice(-SUGGEST_CONTEXT);
      const lines = await linesFromMessages(chatId, picked);
      if (!active) return;
      const needed = await needsReply(lines, typesafeKey);
      if (!active) return;
      if (!needed) return show(null);
      show({ status: 'pending', label: 'Preparing a reply…' });
      const model = await resolveProvider(accountId, config);
      if (!active) return;
      const reply = bareLine((await completeOver(model, lines, replyRequest)).text);
      if (!reply) throw new AiError('server', 'The model suggested nothing.');
      show({ status: 'ready', text: reply, label: model.label });
    };
    void run().catch((error) =>
      show({ status: 'error', text: errorMessage(error, 'Could not suggest a reply') })
    );
    return () => {
      active = false;
    };
  }, [accountId, chatId, enabled, key, settled]);

  return {
    suggestion: enabled ? current : null,
    dismiss: () => {
      if (key) setResult({ key, suggestion: null });
    },
  };
}

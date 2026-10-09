import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';

import { isAssistanceMessage, prepareReply } from '@/core/ai/chat-assistance';
import { useAiConfig } from '@/core/ai/use-config';
import { errorMessage } from '@/core/errors';
import { useChatStore } from '@/core/messaging/chat-store';
import { draftKey } from '@/core/messaging/drafts';
import type { ChatId } from '@/core/messaging/types';
import { useReplyKey } from './use-reply-key';

type Suggestion =
  | { status: 'pending' }
  | { status: 'ready'; text: string; label: string }
  | { status: 'error'; text: string };

export function useReplySuggestion(chatId: ChatId, available: boolean) {
  const focused = useIsFocused();
  const config = useAiConfig();
  const draft = useChatStore((s) => s.drafts[draftKey(chatId)] ?? '');
  const history = useChatStore((s) => s.messageHistory[chatId]);
  const last = useChatStore((s) => s.messages[chatId])?.findLast(isAssistanceMessage);
  const { accountId, kind, key } = useReplyKey(chatId, last, config?.followUps === true);
  const enabled =
    focused &&
    (kind === 'follow-up' || config?.suggestOnOpen === true) &&
    available &&
    history !== undefined &&
    !history.loading &&
    !history.error &&
    !draft;
  const [result, setResult] = useState<{ key: string; suggestion: Suggestion | null } | null>(null);
  const current = result?.key === key ? result.suggestion : null;
  const settled = result?.key === key && (current === null || current.status === 'ready');

  useEffect(() => {
    if (!enabled || !config || !accountId || !key || settled) return;
    const controller = new AbortController();
    const show = (suggestion: Suggestion | null) => {
      if (!controller.signal.aborted) setResult({ key, suggestion });
    };
    void Promise.resolve()
      .then(async () => {
        if (controller.signal.aborted) return;
        show({ status: 'pending' });
        const reply = await prepareReply(accountId, chatId, config, controller.signal, kind);
        show(reply ? { status: 'ready', ...reply } : null);
      })
      .catch((error) =>
        show({ status: 'error', text: errorMessage(error, 'Could not suggest a reply') })
      );
    return () => controller.abort();
  }, [accountId, chatId, config, enabled, key, kind, settled]);

  return {
    suggestion: enabled ? current : null,
    kind,
    dismiss: () => {
      if (key) setResult({ key, suggestion: null });
    },
  };
}

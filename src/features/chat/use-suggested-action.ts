import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';

import { isAssistanceMessage, recommendAction } from '@/core/ai/chat-assistance';
import type { SuggestedAction } from '@/core/ai/action-decision';
import { deviceLanguage } from '@/core/ai/languages';
import { useAiConfig } from '@/core/ai/use-config';
import { useChatStore } from '@/core/messaging/chat-store';
import { contentPreview } from '@/core/messaging/preview';
import type { ChatId } from '@/core/messaging/types';

export function useSuggestedAction(chatId: ChatId, available: boolean) {
  const focused = useIsFocused();
  const config = useAiConfig();
  const accountId = useChatStore((s) => s.accountId);
  const messages = useChatStore((s) => s.messages[chatId]);
  const history = useChatStore((s) => s.messageHistory[chatId]);
  const last = messages?.findLast(isAssistanceMessage);
  const language = deviceLanguage();
  const key =
    accountId && last
      ? `${accountId}\n${chatId}\n${last.id}\n${contentPreview(last.content)}\n${language.tag}`
      : null;
  const enabled =
    focused && available && config?.suggestActions && history && !history.loading && !history.error;
  const [result, setResult] = useState<{ key: string; action: SuggestedAction | null } | null>(
    null
  );
  useEffect(() => {
    if (!enabled || !accountId || !key) return;
    const controller = new AbortController();
    void recommendAction(accountId, chatId, controller.signal)
      .then((action) => {
        if (!controller.signal.aborted) setResult({ key, action });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, action: null });
      });
    return () => controller.abort();
  }, [accountId, chatId, enabled, key]);
  return enabled && result?.key === key ? result.action : null;
}

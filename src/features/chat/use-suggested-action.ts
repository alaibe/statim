import { useIsFocused } from 'expo-router';

import { latestIncoming, messageKey, recommendAction } from '@/core/ai/chat-assistance';
import { deviceLanguage } from '@/core/ai/languages';
import { useAiConfig } from '@/core/ai/use-config';
import { useChatStore } from '@/core/messaging/chat-store';
import type { ChatId } from '@/core/messaging/types';
import { useKeyedLoad } from '@/lib/use-keyed-load';

export function useSuggestedAction(chatId: ChatId, available: boolean) {
  const focused = useIsFocused();
  const config = useAiConfig();
  const accountId = useChatStore((s) => s.accountId);
  const latest = latestIncoming(useChatStore((s) => s.messages[chatId]));
  const history = useChatStore((s) => s.messageHistory[chatId]);
  const enabled =
    focused && available && config?.suggestActions && history && !history.loading && !history.error;
  const key =
    enabled && accountId && latest
      ? `${accountId}\n${chatId}\n${messageKey(latest)}\n${deviceLanguage().tag}`
      : null;
  return (
    useKeyedLoad(key, (_, signal) => recommendAction(accountId!, chatId, signal)).value ?? null
  );
}

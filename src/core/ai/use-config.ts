import { useSyncExternalStore } from 'react';

import { useAppearanceStore } from '@/core/app/appearance';
import { useChatStore } from '@/core/messaging/chat-store';
import { useKeyedLoad } from '@/lib/use-keyed-load';

import { aiConfigRevision, loadAiConfig, subscribeAiConfig } from './config';

export function useAiConfig() {
  const accountId = useChatStore((s) => s.accountId);
  const settingsAccountId = useAppearanceStore((s) => s.accountId);
  const enabled = useAppearanceStore((s) => s.aiInChats);
  const revision = useSyncExternalStore(subscribeAiConfig, aiConfigRevision);
  const key =
    enabled && accountId && accountId === settingsAccountId ? `${accountId}:${revision}` : null;
  return useKeyedLoad(key, () => loadAiConfig(accountId!)).value;
}

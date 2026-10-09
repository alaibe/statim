import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useLockStore } from '@/core/account/lock-store';
import { useAppearanceStore } from '@/core/app/appearance';
import { useChatStore } from '@/core/messaging/chat-store';
import { useKeyedLoad } from '@/lib/use-keyed-load';

import { aiConfigRevision, loadAiConfig, subscribeAiConfig } from './config';

const foreground = () => AppState.currentState === 'active';
const subscribeForeground = (listener: () => void) => {
  const subscription = AppState.addEventListener('change', listener);
  return () => subscription.remove();
};

export function useAiConfig() {
  const accountId = useChatStore((s) => s.accountId);
  const settingsAccountId = useAppearanceStore((s) => s.accountId);
  const enabled = useAppearanceStore((s) => s.aiInChats);
  const unlocked = useLockStore((s) => s.status === 'open');
  const active = useSyncExternalStore(subscribeForeground, foreground);
  const revision = useSyncExternalStore(subscribeAiConfig, aiConfigRevision);
  const config = useKeyedLoad(
    enabled && accountId === settingsAccountId ? accountId : null,
    loadAiConfig,
    revision
  ).value;
  return unlocked && active ? config : undefined;
}

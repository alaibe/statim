import { invoke } from '@tauri-apps/api/core';
import { useGlobalSearchParams, useSegments } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useLockStore } from '@/core/account/lock-store';
import { useChatStore } from '@/core/messaging/chat-store';
import { parseChatId } from '@/core/messaging/namespace';
import { useChatTitles } from '@/features/chat/use-display-names';

import { useChatHistory } from './chat-history';

const LISTED = 10;
const LONGEST_TITLE = 48;

const clip = (title: string) =>
  title.length > LONGEST_TITLE ? `${title.slice(0, LONGEST_TITLE - 1)}…` : title;

/**
 * Keeps the app menu's History in step with the chats opened in the pane. The
 * menu bar stays readable while the app is locked, so it lists nothing then.
 */
export function HistoryMenu() {
  const segments = useSegments() as string[];
  const { id } = useGlobalSearchParams<{ id?: string }>();
  const openId = segments[0] === 'chat' && id ? parseChatId(id) : null;
  const unlocked = useLockStore((s) => s.status === 'open');
  const recent = useChatHistory((s) => s.recent);
  const back = useChatHistory((s) => unlocked && s.back.length > 0);
  const forward = useChatHistory((s) => unlocked && s.forward.length > 0);
  const chats = useChatStore(
    useShallow((s) =>
      recent.flatMap((entry) => s.chats.find((chat) => chat.id === entry) ?? []).slice(0, LISTED)
    )
  );
  const { titleOf } = useChatTitles(chats);
  const listed = unlocked ? chats.map((chat) => ({ id: chat.id, title: clip(titleOf(chat)) })) : [];
  const key = JSON.stringify([back, forward, listed]);

  useEffect(() => {
    if (openId) useChatHistory.getState().visit(openId);
  }, [openId]);

  const publish = useEffectEvent(() =>
    invoke('menu_history', { back, forward, chats: listed }).catch(() => {})
  );
  useEffect(() => {
    void publish();
  }, [key]);

  useEffect(
    () => () => {
      void invoke('menu_history', { back: false, forward: false, chats: [] }).catch(() => {});
    },
    []
  );

  return null;
}

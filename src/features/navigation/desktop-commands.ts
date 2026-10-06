import { router } from 'expo-router';

import type { ChatFilter } from '@/core/messaging/folders';
import { crossesFolders } from '@/features/chat/chat-list-contents';
import { useChatListStore } from '@/features/chat/chat-list-store';

import { openTab } from './open';

/** The command each ⌘ or Ctrl shortcut runs; the app menu shows the same keys. */
export const SHORTCUTS: Record<string, string> = {
  k: 'switcher',
  n: 'new-message',
  f: 'find',
  ',': 'settings',
  '1': 'tab-chats',
  '2': 'tab-contacts',
  '3': 'tab-settings',
};

const FILTERS: readonly ChatFilter[] = ['all', 'unread', 'mentions', 'dms', 'groups'];

/**
 * Runs a command from the keyboard or the app menu, given where the window is.
 * The switcher is the caller's, since it is component state.
 */
export function runCommand(command: string, segments: readonly string[], chatId?: string): void {
  const list = useChatListStore.getState();
  const showList = () => {
    if (segments[0] !== 'chat' && !segments.includes('(chats)')) openTab('/chats');
  };
  const filter = FILTERS.find((entry) => command === `filter-${entry}`);
  if (filter) {
    list.setFolder(null);
    list.setFilter(filter);
    showList();
  } else if (command === 'archive' || command === 'blocked') {
    if (crossesFolders(list.filter)) list.setFilter('all');
    list.setFolder(command);
    showList();
  } else if (command === 'new-message') {
    router.push('/new-chat');
  } else if (command === 'new-group') {
    router.push('/new-chat?mode=group');
  } else if (command === 'find') {
    if (segments[0] !== 'search') {
      router.push(chatId ? `/search?chatId=${encodeURIComponent(chatId)}` : '/search');
    }
  } else if (command === 'settings' || command === 'tab-settings') {
    openTab('/settings');
  } else if (command === 'tab-chats') {
    openTab('/chats');
  } else if (command === 'tab-contacts') {
    openTab('/contacts');
  } else if (command === 'requests') {
    openTab('/requests');
  }
}

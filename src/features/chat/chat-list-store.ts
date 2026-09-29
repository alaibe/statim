import { create } from 'zustand';

import type { ChatFilter, Folder } from '@/core/messaging/folders';

import { crossesFolders } from './chat-list-contents';

interface ChatListState {
  folder: Folder | null;
  setFolder(folder: Folder | null): void;
  filter: ChatFilter;
  setFilter(filter: ChatFilter): void;
}

export const useChatListStore = create<ChatListState>((set) => ({
  folder: null,
  setFolder: (folder) => set({ folder }),
  filter: 'all',
  setFilter: (filter) => set(crossesFolders(filter) ? { filter, folder: null } : { filter }),
}));

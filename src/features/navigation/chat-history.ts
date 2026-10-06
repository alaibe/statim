import { create } from 'zustand';

import type { ChatId } from '@/core/messaging/types';

const KEEP = 20;

interface ChatHistoryState {
  /** Oldest first, so the chat Back opens is last. */
  back: ChatId[];
  current: ChatId | null;
  /** The chat Forward opens is last. */
  forward: ChatId[];
  /** Newest first, each chat once. */
  recent: ChatId[];
  visit(id: ChatId): void;
  /** Moves to the nearest chat that still exists that way, and returns it. */
  step(direction: 'back' | 'forward', exists: (id: ChatId) => boolean): ChatId | null;
}

const withRecent = (recent: ChatId[], id: ChatId) =>
  [id, ...recent.filter((entry) => entry !== id)].slice(0, KEEP);

/** The chats opened in the desktop pane, for Back, Forward and the History menu. */
export const useChatHistory = create<ChatHistoryState>((set, get) => ({
  back: [],
  current: null,
  forward: [],
  recent: [],

  visit(id) {
    const { back, current, recent } = get();
    if (id === current) return;
    set({
      back: current ? [...back, current].slice(-KEEP) : back,
      current: id,
      forward: [],
      recent: withRecent(recent, id),
    });
  },

  step(direction, exists) {
    const { back, current, forward, recent } = get();
    const from = direction === 'back' ? [...back] : [...forward];
    const to = direction === 'back' ? [...forward] : [...back];
    let target = from.pop();
    while (target !== undefined && !exists(target)) target = from.pop();
    if (target === undefined) return null;
    if (current) to.push(current);
    set({
      back: direction === 'back' ? from : to,
      forward: direction === 'back' ? to : from,
      current: target,
      recent: withRecent(recent, target),
    });
    return target;
  },
}));

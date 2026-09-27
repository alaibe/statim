import { useEffect, useState } from 'react';

import { useChatStore } from '@/core/messaging/chat-store';

const KEY = 'chat.recentEmoji';
const LIMIT = 32;

/** The account's recently picked emoji, newest first, and a way to add one. */
export function useRecentEmoji() {
  const storage = useChatStore((s) => s.accountStorage);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!storage) return;
    let cancelled = false;
    storage
      .get<string[]>(KEY)
      .then((saved) => {
        if (!cancelled && Array.isArray(saved)) setRecent(saved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const remember = (emoji: string) => {
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, LIMIT);
    setRecent(next);
    storage?.set(KEY, next).catch(() => {});
  };

  return [recent, remember] as const;
}

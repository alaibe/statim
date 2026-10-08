import { useEffect, useState } from 'react';

import type { ChatMessage } from '@/core/messaging/types';

export const FOLLOW_UP_DELAY = 24 * 60 * 60 * 1000;

export function useFollowUpDue(message: ChatMessage | undefined, enabled: boolean) {
  const sentAt = enabled && message?.fromMe && message.status === 'sent' ? message.sentAt : null;
  const [due, setDue] = useState<number | null>(null);
  useEffect(() => {
    if (sentAt === null) return;
    const timer = setTimeout(
      () => setDue(sentAt),
      Math.max(0, sentAt + FOLLOW_UP_DELAY - Date.now())
    );
    return () => clearTimeout(timer);
  }, [sentAt]);
  return sentAt !== null && due === sentAt;
}

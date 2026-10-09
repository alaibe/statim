import { useEffect, useState } from 'react';

import { messageKey } from '@/core/ai/chat-assistance';
import type { ReplyKind } from '@/core/ai/reply-decision';
import { useChatStore } from '@/core/messaging/chat-store';
import type { ChatId, ChatMessage } from '@/core/messaging/types';

export const FOLLOW_UP_DELAY = 24 * 60 * 60 * 1000;

function useFollowUpDue(message: ChatMessage | undefined, enabled: boolean) {
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

export function useReplyKey(chatId: ChatId, last: ChatMessage | undefined, followUps: boolean) {
  const accountId = useChatStore((s) => s.accountId);
  const followUp = useFollowUpDue(last, followUps);
  const kind: ReplyKind = followUp ? 'follow-up' : 'reply';
  const key =
    accountId && last && (followUp || !last.fromMe)
      ? `${accountId}\n${chatId}\n${kind}\n${messageKey(last)}`
      : null;
  return { accountId, kind, key };
}

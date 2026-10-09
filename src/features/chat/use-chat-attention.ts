import { useEffect, useState } from 'react';

import { assistanceLines, canAssist, replyNeeded } from '@/core/ai/chat-assistance';
import type { AiConfig } from '@/core/ai/config';
import type { ReplyKind } from '@/core/ai/reply-decision';
import type { Chat } from '@/core/messaging/types';
import { useReplyKey } from './use-reply-key';

export function useChatAttention(chat: Chat, config: AiConfig | undefined): ReplyKind | null {
  const { accountId, kind, key } = useReplyKey(
    chat.id,
    chat.lastMessage,
    config?.followUps === true
  );
  const checking = (kind === 'follow-up' || config?.replyBadges === true) && canAssist(chat);
  const [result, setResult] = useState<{ key: string; needed: boolean | null } | null>(null);
  const decided = result?.key === key && result.needed !== null;

  useEffect(() => {
    if (!checking || !accountId || !key || decided) return;
    const controller = new AbortController();
    void assistanceLines(chat.id)
      .then((lines) => replyNeeded(accountId, chat.id, lines, controller.signal, kind))
      .catch(() => null)
      .then((needed) => {
        if (!controller.signal.aborted) setResult({ key, needed });
      });
    return () => controller.abort();
  }, [accountId, chat.id, checking, decided, key, kind]);

  return checking && result?.key === key && result.needed ? kind : null;
}

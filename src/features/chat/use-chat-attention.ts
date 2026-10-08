import { useEffect, useState } from 'react';
import { useFollowUpDue } from './use-follow-up-due';

import {
  assistanceLines,
  canAssist,
  isAssistanceMessage,
  replyNeeded,
  replyTarget,
} from '@/core/ai/chat-assistance';
import type { AiConfig } from '@/core/ai/config';
import { useChatStore } from '@/core/messaging/chat-store';
import type { Chat } from '@/core/messaging/types';

export function useChatAttention(chat: Chat, config: AiConfig | undefined) {
  const accountId = useChatStore((s) => s.accountId);
  const messages = useChatStore((s) => s.messages[chat.id]);
  const history = useChatStore((s) => s.messageHistory[chat.id]);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const enabled = (config?.replyBadges || config?.followUps) && canAssist(chat);
  const followUp = useFollowUpDue(
    messages?.findLast(isAssistanceMessage),
    config?.followUps === true
  );
  const kind = followUp ? 'follow-up' : 'reply';
  const target = replyTarget(messages, kind);
  const key = accountId && target ? `${accountId}\n${chat.id}\n${kind}\n${target}` : null;
  const [result, setResult] = useState<{ key: string; needed: boolean } | null>(null);

  useEffect(() => {
    if (enabled && !history) void loadMessages(chat.id);
  }, [chat.id, enabled, history, loadMessages]);

  const checking = enabled && (followUp ? config?.followUps : config?.replyBadges);
  const ready = checking && history && !history.loading && !history.error;
  useEffect(() => {
    if (!ready || !accountId || !key) return;
    const controller = new AbortController();
    void assistanceLines(chat.id)
      .then((lines) =>
        !controller.signal.aborted
          ? replyNeeded(accountId, chat.id, lines, controller.signal, kind)
          : false
      )
      .then((needed) => {
        if (!controller.signal.aborted) setResult({ key, needed });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, needed: false });
      });
    return () => controller.abort();
  }, [accountId, chat.id, key, kind, ready]);

  return checking && key && result?.key === key && result.needed
    ? followUp
      ? 'Follow up'
      : 'Reply needed'
    : null;
}

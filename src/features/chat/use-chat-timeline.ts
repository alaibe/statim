import { useObserve } from 'expo-observe';
import { useEffect, useMemo, useRef, useState } from 'react';

import { toast } from '@/design';
import { reportError } from '@/core/app/report-error';
import { useChatStore } from '@/core/messaging/chat-store';
import type { ChatSession } from '@/core/messaging/protocol';
import type { ChatMessage, ChatId, MessageId } from '@/core/messaging/types';
import { isNewReply, newReplyCounts, threadReadAt } from '@/core/messaging/thread-reads';
import { unreadState } from '@/core/messaging/unread';
import { useJumpStore } from './jump-store';
import type { MessageListHandle } from './message-list';

const NO_MESSAGES: readonly ChatMessage[] = Object.freeze([]);
const NO_COUNTS: ReadonlyMap<MessageId, number> = new Map();

export function useChatTimeline(
  id: ChatId,
  thread: MessageId | undefined,
  session: ChatSession | undefined,
  countReplies: boolean
) {
  const accountId = useChatStore((s) => s.accountId);
  const chat = useChatStore((s) => s.chats.find((c) => c.id === id));
  const listed = chat !== undefined;
  const allMessages = useChatStore((s) => s.messages[id]) ?? NO_MESSAGES;
  const messageHistory = useChatStore((s) => s.messageHistory[id]);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);
  const watchPresence = useChatStore((s) => s.watchPresence);
  const markRead = useChatStore((s) => s.markRead);
  const readUpTo = useChatStore((s) => s.readAt[id] ?? 0);
  const threadReads = useChatStore((s) => s.threadReads[id]);
  const markThreadRead = useChatStore((s) => s.markThreadRead);

  const messages = useMemo(() => {
    if (!thread) return allMessages.filter((message) => !message.threadRoot);
    const root = allMessages.find((message) => message.id === thread);
    return [
      ...(root ? [root] : []),
      ...allMessages.filter((message) => message.threadRoot === thread),
    ];
  }, [allMessages, thread]);
  const byId = new Map(allMessages.map((message) => [message.id, message]));
  const replyCounts = new Map<MessageId, number>();
  if (countReplies) {
    for (const message of allMessages) {
      if (message.threadRoot) {
        replyCounts.set(message.threadRoot, (replyCounts.get(message.threadRoot) ?? 0) + 1);
      }
    }
  }
  const newReplies = countReplies ? newReplyCounts(allMessages, threadReads, readUpTo) : NO_COUNTS;

  const threadSince = thread ? threadReadAt(threadReads, readUpTo, thread) : 0;
  const [seenWhenOpened] = useState(threadSince);
  const repliesIn = (since: number) =>
    thread ? messages.filter((m) => m.threadRoot === thread && isNewReply(m, since)) : NO_MESSAGES;
  const unseenReplies = repliesIn(seenWhenOpened);
  const threadUnread = repliesIn(threadSince).length > 0;
  useEffect(() => {
    if (thread && threadUnread) markThreadRead(id, thread).catch(reportError);
  }, [id, thread, threadUnread, markThreadRead]);

  const { markInteractive } = useObserve();
  useEffect(() => {
    if (messages.length > 0 || listed) markInteractive();
  }, [messages.length, listed, markInteractive]);

  useEffect(() => {
    if (id && accountId && !thread) void loadMessages(id);
  }, [id, thread, accountId, session, loadMessages]);

  useEffect(
    () => (session && !thread ? watchPresence(id) : undefined),
    [id, thread, session, watchPresence]
  );

  const newest = allMessages[allMessages.length - 1];
  const newestFromParticipant = newest && !newest.fromMe ? newest.id : null;
  const unseen = unreadState(chat, readUpTo, allMessages).unread;
  useEffect(() => {
    if (id && !thread && unseen) markRead(id).catch(reportError);
  }, [id, thread, markRead, unseen, newestFromParticipant]);

  const list = useRef<MessageListHandle>(null);
  const firstUnseenReply = unseenReplies[0]?.id;
  useEffect(() => {
    if (firstUnseenReply)
      requestAnimationFrame(() => list.current?.scrollToMessage(firstUnseenReply));
  }, [firstUnseenReply]);
  const followNewest = () => list.current?.scrollToEnd();
  const loadEarlier = () => {
    if (thread || !messageHistory?.hasOlder || messageHistory.loading || messageHistory.error)
      return;
    void loadOlderMessages(id);
  };

  const jump = useJumpStore((s) => (!thread && s.target?.chatId === id ? s.target : null));
  const highlighted = useJumpStore((s) => s.landed);
  const land = useJumpStore((s) => s.land);
  useEffect(() => {
    if (!jump) return;
    if (messages.some((message) => message.id === jump.id)) {
      land(jump.id);
      requestAnimationFrame(() => list.current?.scrollToMessage(jump.id));
      return;
    }
    if (!messageHistory || messageHistory.loading) return;
    const oldest = messages[0];
    if (
      oldest &&
      oldest.sentAt >= jump.sentAt &&
      messageHistory.hasOlder &&
      !messageHistory.error
    ) {
      void loadOlderMessages(id);
    } else {
      land(null);
      toast.error('Could not find that message in this chat');
    }
  }, [id, jump, messages, messageHistory, loadOlderMessages, land]);
  useEffect(() => {
    if (!highlighted) return;
    const timer = setTimeout(() => land(null), 2000);
    return () => clearTimeout(timer);
  }, [highlighted, land]);

  return {
    allMessages,
    messages,
    byId,
    replyCounts,
    newReplies,
    unseenReplies,
    messageHistory,
    loadMessages,
    loadOlderMessages,
    list,
    followNewest,
    loadEarlier,
    highlighted,
  };
}

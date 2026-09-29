import { View } from 'react-native';

import { contentPreview, isNewDay } from '@/core/messaging/preview';
import type { ChatMessage, MessageId } from '@/core/messaging/types';

import { DateSeparator } from './date-separator';
import type { MessageAction } from './message-actions';
import { MessageBubble, type ReplyPreview } from './message-bubble';

const GROUP_WINDOW_MS = 60_000;

const MISSING_REPLY = { author: '', preview: 'Original message' };

export function replyPreview(target: ChatMessage, nameFor: (id: string) => string): ReplyPreview {
  return {
    author: target.fromMe ? 'You' : nameFor(target.senderId),
    preview: contentPreview(target.content) || 'Message',
  };
}

export function MessageRow({
  message,
  previous,
  next,
  highlighted,
  replyTarget,
  nameFor,
  selfId,
  read,
  senderName,
  isGroup,
  onCommand,
  actionsFor,
  onReact,
  onVote,
  replies,
  onOpenThread,
}: {
  message: ChatMessage;
  previous: ChatMessage | undefined;
  next: ChatMessage | undefined;
  highlighted: boolean;
  replyTarget: ChatMessage | undefined;
  nameFor: (id: string) => string;
  selfId: string;
  read: boolean;
  senderName: string;
  isGroup: boolean;
  onCommand: (command: string) => void;
  actionsFor: (message: ChatMessage) => MessageAction[];
  onReact?: (messageId: MessageId, emoji: string) => void;
  onVote?: (messageId: MessageId, optionIds: number[]) => Promise<void>;
  replies: number;
  onOpenThread?: (root: MessageId) => void;
}) {
  const startsNewDay = isNewDay(previous?.sentAt, message.sentAt);
  const grouped = !!previous && sameRun(previous, message);
  const tail = !next || !sameRun(message, next);

  return (
    <>
      {startsNewDay ? <DateSeparator at={message.sentAt} /> : null}
      <View className={highlighted ? 'bg-brand/15' : undefined}>
        <MessageBubble
          message={message}
          grouped={grouped}
          tail={tail}
          read={read}
          selfId={selfId}
          nameFor={nameFor}
          senderName={senderName}
          showSender={isGroup && !grouped && !message.privateToMe}
          onCommand={onCommand}
          actions={() => actionsFor(message)}
          replyPreview={
            message.replyTo
              ? replyTarget
                ? replyPreview(replyTarget, nameFor)
                : MISSING_REPLY
              : undefined
          }
          onReact={onReact && ((emoji) => onReact(message.id, emoji))}
          onVote={onVote && ((optionIds) => onVote(message.id, optionIds))}
          thread={
            replies > 0 && onOpenThread
              ? { replies, onOpen: () => onOpenThread(message.id) }
              : undefined
          }
        />
      </View>
    </>
  );
}

function sameRun(earlier: ChatMessage, later: ChatMessage): boolean {
  return (
    earlier.senderId === later.senderId &&
    later.sentAt - earlier.sentAt < GROUP_WINDOW_MS &&
    earlier.content.kind !== 'system' &&
    later.content.kind !== 'system' &&
    !isNewDay(earlier.sentAt, later.sentAt)
  );
}

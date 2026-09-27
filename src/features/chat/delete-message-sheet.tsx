import { ConfirmSheet } from '@/design';
import { useChatStore } from '@/core/messaging/chat-store';
import type { ChatMessage, ChatId } from '@/core/messaging/types';

import { useAction } from '@/features/use-action';

export interface DeleteTarget {
  message: ChatMessage;
  forEveryone: boolean;
}

const COPY = {
  everyone: {
    title: 'Delete message for everyone?',
    body: 'This removes the message for everyone in the chat.',
    label: 'Delete for everyone',
  },
  me: {
    title: 'Delete message for you?',
    body: 'This removes the message from your account. The others in the chat keep it.',
    label: 'Delete for me',
  },
};

export function DeleteMessageSheet({
  chatId,
  target,
  onClose,
}: {
  chatId: ChatId;
  target: DeleteTarget;
  onClose: () => void;
}) {
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const remove = useAction(
    ({ message, forEveryone }: DeleteTarget) => deleteMessage(chatId, message.id, forEveryone),
    { failure: 'Could not delete message' }
  );
  const copy = COPY[target.forEveryone ? 'everyone' : 'me'];

  return (
    <ConfirmSheet
      visible
      onClose={onClose}
      title={copy.title}
      body={copy.body}
      confirm={{
        label: copy.label,
        tone: 'danger',
        onPress: async () => {
          if (await remove.run(target)) onClose();
        },
      }}
    />
  );
}

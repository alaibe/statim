import { ConfirmSheet } from '@/design';
import { useChatStore } from '@/core/messaging/chat-store';
import type { ChatMessage, ConversationId } from '@/core/messaging/types';

import { useAction } from './use-action';

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
  conversationId,
  target,
  onClose,
}: {
  conversationId: ConversationId;
  target: DeleteTarget | null;
  onClose: () => void;
}) {
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const remove = useAction(
    ({ message, forEveryone }: DeleteTarget) =>
      deleteMessage(conversationId, message.id, forEveryone),
    { failure: 'Could not delete message' }
  );
  const copy = COPY[target?.forEveryone ? 'everyone' : 'me'];

  return (
    <ConfirmSheet
      visible={target !== null}
      onClose={onClose}
      title={copy.title}
      body={copy.body}
      busy={remove.busy}
      confirm={{
        label: copy.label,
        tone: 'danger',
        onPress: async () => {
          if (target && (await remove.run(target))) onClose();
        },
      }}
    />
  );
}

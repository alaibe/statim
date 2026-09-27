import { FlashList } from '@shopify/flash-list';
import { View } from 'react-native';

import { ListItem, Sheet, toast } from '@/design';
import { useChatStore } from '@/core/messaging/chat-store';
import { contentPreview } from '@/core/messaging/preview';
import type { ChatMessage, ConversationId } from '@/core/messaging/types';
import { errorMessage } from '@/core/errors';
import { ConversationAvatar } from './conversation-avatar';
import { useConversationTitles } from './use-display-names';

export function ForwardSheet({
  message,
  from,
  onClose,
}: {
  message: ChatMessage | null;
  from: ConversationId;
  onClose: () => void;
}) {
  const conversations = useChatStore((s) => s.conversations);
  const { selfIdOf, titleOf } = useConversationTitles(conversations);
  const sendMessage = useChatStore((s) => s.sendMessage);

  return (
    <Sheet
      visible={message !== null}
      onClose={onClose}
      title="Forward to"
      subtitle={message ? contentPreview(message.content) : undefined}>
      <View
        style={{ borderCurve: 'continuous' }}
        className="max-h-[420px] overflow-hidden rounded-card bg-surface-raised">
        <FlashList
          data={conversations.filter((c) => c.id !== from)}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => {
            return (
              <ListItem
                testID={`forward-to-${item.id}`}
                title={titleOf(item)}
                leading={
                  <ConversationAvatar conversation={item} selfId={selfIdOf(item)} size="sm" />
                }
                onPress={() => {
                  onClose();
                  if (!message) return;
                  sendMessage(item.id, message.content)
                    .then(() => toast.success('Forwarded'))
                    .catch((e) => toast.error(errorMessage(e, 'Could not forward')));
                }}
              />
            );
          }}
        />
      </View>
    </Sheet>
  );
}

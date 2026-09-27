import { FlashList } from '@shopify/flash-list';
import { View } from 'react-native';

import { ListItem, Sheet, toast } from '@/design';
import { selfIdFor, useChatStore } from '@/core/messaging/chat-store';
import { chatTitle } from '@/core/messaging/display-names';
import { contentPreview } from '@/core/messaging/preview';
import type { ChatMessage, ChatId, ParticipantId } from '@/core/messaging/types';
import { errorMessage } from '@/core/errors';
import { ChatAvatar } from './chat-avatar';

export function ForwardSheet({
  message,
  from,
  nameFor,
  onClose,
}: {
  message: ChatMessage;
  from: ChatId;
  nameFor: (id: ParticipantId) => string;
  onClose: () => void;
}) {
  const chats = useChatStore((s) => s.chats);
  const sessions = useChatStore((s) => s.sessions);
  const sendMessage = useChatStore((s) => s.sendMessage);

  return (
    <Sheet visible onClose={onClose} title="Forward to" subtitle={contentPreview(message.content)}>
      <View
        style={{ borderCurve: 'continuous' }}
        className="max-h-[420px] overflow-hidden rounded-card bg-surface-raised">
        <FlashList
          data={chats.filter((c) => c.id !== from)}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => {
            const selfId = selfIdFor({ sessions }, item.protocol);
            return (
              <ListItem
                testID={`forward-to-${item.id}`}
                title={chatTitle(item, selfId, nameFor)}
                leading={<ChatAvatar chat={item} selfId={selfId} size="sm" />}
                onPress={() => {
                  onClose();
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

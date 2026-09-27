import { Stack } from 'expo-router';

import { FlashList } from '@shopify/flash-list';

import { EmptyState, ListItem, Screen, SwipeableRow } from '@/design';
import { useChatStore } from '@/core/messaging/chat-store';
import { splitRequests } from '@/core/messaging/folders';
import { formatTimestamp, messagePreview } from '@/core/messaging/preview';
import { answerRequest } from '@/features/chat/requests';
import { ChatAvatar } from '@/features/chat/chat-avatar';
import { useChatTitles } from '@/features/chat/use-display-names';
import { openChat } from '@/features/navigation/open';

export default function RequestsScreen() {
  const chats = useChatStore((s) => s.chats);
  const { requests } = splitRequests(chats);

  const { selfIdOf, titleOf } = useChatTitles(requests);

  return (
    <Screen className="px-0" edges={[]}>
      <Stack.Screen options={{ title: 'Requests' }} />

      {requests.length === 0 ? (
        <EmptyState title="Nothing waiting" description="New chats will show up here." />
      ) : (
        <FlashList
          data={requests}
          keyExtractor={(c) => c.id}
          contentInsetAdjustmentBehavior="automatic"
          renderItem={({ item }) => (
            <SwipeableRow
              left={[
                {
                  id: 'accept',
                  label: 'Accept',
                  icon: 'checkmark-circle-outline',
                  tone: 'brand',
                  onPress: () => answerRequest(item.id, 'accepted'),
                },
              ]}
              right={[
                {
                  id: 'decline',
                  label: 'Decline',
                  icon: 'close-circle-outline',
                  destructive: true,
                  onPress: () => answerRequest(item.id, 'declined'),
                },
              ]}>
              <ListItem
                testID={`request-${item.id}`}
                title={titleOf(item)}
                subtitle={messagePreview(item.lastMessage)}
                meta={item.lastMessage ? formatTimestamp(item.lastMessage.sentAt) : undefined}
                leading={<ChatAvatar chat={item} selfId={selfIdOf(item)} size="md" />}
                onPress={() => openChat(item.id)}
              />
            </SwipeableRow>
          )}
        />
      )}
    </Screen>
  );
}

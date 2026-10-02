import { FlashList } from '@shopify/flash-list';
import { clearSharedPayloads, getSharedPayloads, type SharePayload } from 'expo-sharing';
import { useState } from 'react';

import { EmptyState, ListItem, Loading, ModalHeader, Screen, toast } from '@/design';
import { useAccountStore } from '@/core/account/account-store';
import { isLocalChat, SAVED_LOCAL_ID, STATIM_LOCAL_ID } from '@/core/messaging/bots';
import { sessionFor, useChatStore } from '@/core/messaging/chat-store';
import type { Chat } from '@/core/messaging/types';
import { errorMessage } from '@/core/errors';
import { openChatFromSheet } from '@/features/navigation/open';
import { useBack } from '@/features/navigation/use-back';

import { deleteSharedFiles, imageFromShare } from './attachments/shared-image';
import { ChatAvatar } from './chat-avatar';
import { useChatTitles } from './use-display-names';

export function ShareScreen() {
  const goBack = useBack('/');
  const status = useAccountStore((s) => s.status);
  const [photos] = useState(() => getSharedPayloads().filter((p) => p.shareType === 'image'));

  const close = () => {
    clearSharedPayloads();
    deleteSharedFiles(photos);
    goBack();
  };

  return (
    <Screen className="px-0" edges={['top', 'bottom']}>
      <ModalHeader
        title={photos.length > 1 ? `Send ${photos.length} photos to` : 'Send to'}
        onClose={close}
        className="px-gutter"
      />
      {status === 'loading' ? (
        <Loading className="flex-1" />
      ) : status !== 'ready' ? (
        <EmptyState
          icon="person-circle-outline"
          title="No account yet"
          description="Create or import an account in Statim, then share the photo again."
        />
      ) : photos.length === 0 ? (
        <EmptyState icon="images-outline" title="Nothing to send" />
      ) : (
        <ChatPicker
          onPick={(chat) => {
            clearSharedPayloads();
            openChatFromSheet(chat.id);
            sendPhotos(chat, photos);
          }}
        />
      )}
    </Screen>
  );
}

function ChatPicker({ onPick }: { onPick: (chat: Chat) => void }) {
  const chats = useChatStore((s) => s.chats);
  const sessions = useChatStore((s) => s.sessions);
  const { titleOf, selfIdOf } = useChatTitles(chats);
  const takesPhotos = (chat: Chat) =>
    isLocalChat(chat.id)
      ? chat.id === STATIM_LOCAL_ID || chat.id === SAVED_LOCAL_ID
      : Boolean(sessionFor({ sessions }, chat.id)?.sendsImages);

  return (
    <FlashList
      data={chats.filter(takesPhotos)}
      keyExtractor={(c) => c.id}
      contentContainerClassName="px-gutter"
      ListEmptyComponent={
        <EmptyState icon="chatbubbles-outline" title="No chat takes photos yet" />
      }
      renderItem={({ item }) => (
        <ListItem
          testID={`share-to-${item.id}`}
          title={titleOf(item)}
          leading={<ChatAvatar chat={item} selfId={selfIdOf(item)} size="sm" />}
          onPress={() => onPick(item)}
        />
      )}
    />
  );
}

function sendPhotos(chat: Chat, photos: SharePayload[]) {
  const { sendMessage } = useChatStore.getState();
  (async () => {
    for (const photo of photos) await sendMessage(chat.id, await imageFromShare(photo));
  })()
    .catch((e) => toast.error(errorMessage(e, 'Could not send that photo')))
    .finally(() => deleteSharedFiles(photos));
}

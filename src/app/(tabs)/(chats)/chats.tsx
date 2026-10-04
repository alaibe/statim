import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { IconButton, Screen } from '@/design';
import { ChatList } from '@/features/chat/chat-list';
import {
  chatSearchPlaceholder,
  folderLabel,
  leaveFolderLabel,
} from '@/features/chat/chat-list-rows';
import { useChatListStore } from '@/features/chat/chat-list-store';

export default function ChatsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const folder = useChatListStore((s) => s.folder);
  const setFolder = useChatListStore((s) => s.setFolder);

  return (
    <Screen className="px-0" edges={[]}>
      <Stack.Screen
        options={{
          title: folder ? folderLabel(folder) : 'Chats',
          headerLeft: folder
            ? () => (
                <IconButton
                  icon="chevron-back"
                  label={leaveFolderLabel(folder)}
                  tone="brand"
                  onPress={() => setFolder(null)}
                />
              )
            : undefined,
          headerRight: () => (
            <View className="flex-row items-center gap-1">
              <IconButton
                testID="header-new-group"
                icon="people-outline"
                label="New group"
                onPress={() => router.push('/new-chat?mode=group')}
              />
              <IconButton
                testID="header-new-chat"
                icon="create-outline"
                label="New message"
                tone="brand"
                onPress={() => router.push('/new-chat')}
              />
            </View>
          ),
        }}
      />
      <Stack.SearchBar
        placeholder={chatSearchPlaceholder(folder)}
        hideWhenScrolling
        onChangeText={(e) => setQuery(e.nativeEvent.text)}
      />

      <ChatList query={query} />
    </Screen>
  );
}

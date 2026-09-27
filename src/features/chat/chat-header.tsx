import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { botIdFromChat, isLocalChat } from '@/core/messaging/bots';
import { useChatStore } from '@/core/messaging/chat-store';
import type { Chat, ChatId, MessageId } from '@/core/messaging/types';
import { Icon, IconButton, Pressable, Text, useLayoutInsets, useThemeColors } from '@/design';
import { ChatAvatar } from './chat-avatar';
import { headerSubtitle } from './header-subtitle';

interface ChatHeaderProps {
  id: ChatId;
  thread?: MessageId;
  chat?: Chat;
  selfId: string;
  chatTitle: string;
  onBack(): void;
}

export function ChatHeader({ id, thread, chat, selfId, chatTitle, onBack }: ChatHeaderProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const frame = useLayoutInsets();
  const desktop = process.env.EXPO_OS === 'web';
  const isBot = isLocalChat(id);
  const botTagline = useChatStore((s) => (isBot ? s.bots[botIdFromChat(id)]?.tagline : undefined));
  const title = thread ? 'Thread' : chatTitle;

  return (
    <View
      className="absolute left-0 right-0 top-0 z-10 flex-row items-center gap-2 px-3"
      style={{ paddingTop: insets.top + frame.top + 6, paddingBottom: 8 }}>
      {desktop ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={onBack}
          className="h-10 w-10 items-center justify-center overflow-hidden rounded-pill">
          <BlurView
            intensity={40}
            tint={colors.scheme === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View className="absolute inset-0 bg-canvas/55" />
          <Icon name="chevron-back" size={22} tone="brand" />
        </Pressable>
      )}

      <Pressable
        // Pressable merges its children into one accessibility element.
        testID={`chat-header-${id}`}
        accessibilityRole="button"
        accessibilityLabel={thread ? `Thread in ${chatTitle}` : `${title}. Chat details`}
        disabled={isBot || !!thread}
        onPress={() => router.push(`/profile/${id}`)}
        className="flex-1 items-center">
        <View className="max-w-full overflow-hidden rounded-pill px-4 py-1.5">
          <BlurView
            intensity={40}
            tint={colors.scheme === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View className="absolute inset-0 bg-canvas/55" />
          <Text className="text-center font-semibold" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="micro" numberOfLines={1} className="text-center">
            {thread
              ? chatTitle
              : isBot
                ? (botTagline ?? 'On this device only')
                : headerSubtitle(chat)}
          </Text>
        </View>
      </Pressable>

      {thread ? (
        desktop ? (
          <IconButton icon="close" label="Close thread" tone="brand" size={20} onPress={onBack} />
        ) : (
          <View className="h-10 w-10" />
        )
      ) : chat ? (
        <IconButton
          icon="search-outline"
          label="Search in chat"
          tone="brand"
          size={20}
          onPress={() => router.push(`/search?chatId=${encodeURIComponent(id)}`)}
        />
      ) : null}

      {thread ? null : chat ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chat details"
          disabled={isBot}
          onPress={() => router.push(`/profile/${id}`)}>
          <ChatAvatar chat={chat} selfId={selfId} size="md" />
        </Pressable>
      ) : (
        <View className="h-10 w-10" />
      )}
    </View>
  );
}

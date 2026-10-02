import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { botIdFromChat, isLocalChat } from '@/core/messaging/bots';
import { selfIdFor, useChatStore } from '@/core/messaging/chat-store';
import { chatTitle } from '@/core/messaging/display-names';
import type { Chat, MessageId, ParticipantId } from '@/core/messaging/types';
import { Icon, IconButton, Pressable, Text, useLayoutInsets, useThemeColors } from '@/design';
import { ChatAvatar } from './chat-avatar';
import { headerSubtitle } from './header-subtitle';

const desktop = process.env.EXPO_OS === 'web';
const android = process.env.EXPO_OS === 'android';

interface ChatHeaderProps {
  chat: Chat;
  thread?: MessageId;
  nameFor: (id: ParticipantId) => string;
  onBack(): void;
}

export function ChatHeader({ chat, thread, nameFor, onBack }: ChatHeaderProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const { id } = chat;
  const isBot = isLocalChat(id);
  const selfId = useChatStore((s) => selfIdFor(s, chat.protocol));
  const botTagline = useChatStore((s) => (isBot ? s.bots[botIdFromChat(id)]?.tagline : undefined));
  const name = chatTitle(chat, selfId, nameFor);
  const title = thread ? 'Thread' : name;

  return (
    <HeaderBar>
      <BackButton onBack={onBack} />

      <Pressable
        // Pressable merges its children into one accessibility element.
        testID={`chat-header-${id}`}
        accessibilityRole="button"
        accessibilityLabel={thread ? `Thread in ${name}` : `${title}. Chat details`}
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
            {thread ? name : isBot ? (botTagline ?? 'On this device only') : headerSubtitle(chat)}
          </Text>
        </View>
      </Pressable>

      {thread ? (
        <CloseThread onBack={onBack} />
      ) : (
        <>
          <IconButton
            icon="search-outline"
            label="Search in chat"
            tone="brand"
            size={20}
            onPress={() => router.push(`/search?chatId=${encodeURIComponent(id)}`)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Chat details"
            disabled={isBot}
            onPress={() => router.push(`/profile/${id}`)}>
            <ChatAvatar chat={chat} selfId={selfId} size="md" />
          </Pressable>
        </>
      )}
    </HeaderBar>
  );
}

export function PendingChatHeader({ thread, onBack }: { thread?: MessageId; onBack(): void }) {
  return (
    <HeaderBar>
      <BackButton onBack={onBack} />
      <View className="flex-1" />
      {thread ? <CloseThread onBack={onBack} /> : null}
    </HeaderBar>
  );
}

function HeaderBar({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const frame = useLayoutInsets();
  return (
    <View
      // BlurView only tints on Android, so messages scrolled under the header would show through it.
      className={
        android
          ? 'absolute left-0 right-0 top-0 z-10 flex-row items-center gap-2 border-b border-line bg-canvas px-3'
          : 'absolute left-0 right-0 top-0 z-10 flex-row items-center gap-2 px-3'
      }
      style={{ paddingTop: insets.top + frame.top + 6, paddingBottom: 8 }}>
      {children}
    </View>
  );
}

function BackButton({ onBack }: { onBack(): void }) {
  const colors = useThemeColors();
  if (desktop) return null;
  return (
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
  );
}

function CloseThread({ onBack }: { onBack(): void }) {
  return desktop ? (
    <IconButton icon="close" label="Close thread" tone="brand" size={20} onPress={onBack} />
  ) : (
    <View className="h-10 w-10" />
  );
}

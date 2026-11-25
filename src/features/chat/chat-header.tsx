import { useRouter } from "expo-router";
import { View } from "react-native";

import { botIdFromChat, isLocalChat } from "@/core/messaging/bots";
import { selfIdFor, useChatStore } from "@/core/messaging/chat-store";
import { chatTitle } from "@/core/messaging/display-names";
import type { Chat, MessageId, ParticipantId } from "@/core/messaging/types";
import { desktop, IconButton, PhoneHeader, Space, Text, useThemeColors } from "@/design";
import { ChatAvatar } from "./chat-avatar";
import { headerSubtitle } from "./header-subtitle";

interface ChatHeaderProps {
  chat: Chat;
  thread?: MessageId;
  nameFor: (id: ParticipantId) => string;
  onBack(): void;
}

/** The chat's title and its live state; one action: the chat's details, or closing the thread. */
export function ChatHeader({ chat, thread, nameFor, onBack }: ChatHeaderProps) {
  const router = useRouter();
  const { id } = chat;
  const isBot = isLocalChat(id);
  const selfId = useChatStore((s) => selfIdFor(s, chat.protocol));
  const botTagline = useChatStore((s) => (isBot ? s.bots[botIdFromChat(id)]?.tagline : undefined));
  const name = chatTitle(chat, selfId, nameFor);
  const title = thread ? "Thread" : name;
  const subtitle = thread ? name : isBot ? (botTagline ?? "On this device only") : headerSubtitle(chat);

  const action = thread ? (
    desktop ? (
      <IconButton icon="x" label="Close thread" onPress={onBack} />
    ) : undefined
  ) : isBot ? (
    <IconButton
      icon="search"
      label="Search in chat"
      onPress={() => router.push(`/search?chatId=${encodeURIComponent(id)}`)}
    />
  ) : (
    <IconButton icon="ellipsis" label="Chat details" onPress={() => router.push(`/profile/${id}`)} />
  );

  if (!desktop) {
    return (
      <PhoneHeader testID={`chat-header-${id}`} title={title} subtitle={subtitle} onBack={onBack} action={action} />
    );
  }
  return (
    <DetailHeader
      testID={`chat-header-${id}`}
      leading={thread ? undefined : <ChatAvatar chat={chat} selfId={selfId} size={28} />}
      title={title}
      subtitle={subtitle}
      action={action}
    />
  );
}

export function PendingChatHeader({ thread, onBack }: { thread?: MessageId; onBack(): void }) {
  const title = thread ? "Thread" : "Chat";
  if (!desktop) return <PhoneHeader title={title} onBack={onBack} />;
  return (
    <DetailHeader
      title={title}
      action={thread ? <IconButton icon="x" label="Close thread" onPress={onBack} /> : undefined}
    />
  );
}

/** The detail region's top row on the desktop: the item's title in mono, its live state, one ghost action. */
function DetailHeader({
  testID,
  leading,
  title,
  subtitle,
  action,
}: {
  testID?: string;
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <View
      testID={testID}
      className="flex-row items-center"
      style={{
        minHeight: 52,
        gap: Space[3],
        paddingHorizontal: Space[4],
        paddingVertical: Space[2],
        borderBottomWidth: 1,
        borderColor: colors.line,
        backgroundColor: colors.bg,
      }}
    >
      {leading}
      <View className="min-w-0 flex-1">
        <Text variant="heading" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="meta" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

import { View } from "react-native";
import { isLocalChat } from "@/core/messaging/bots";
import type { NetworkId } from "@/core/messaging/networks";
import type { Chat, ParticipantId } from "@/core/messaging/types";
import { Avatar, type AvatarSize, NetworkMark, Radius, useThemeColors } from "@/design";
import { networkLabel } from "@/features/protocols/presentation";
import { useBotAvatar } from "./use-bot-avatar";

/** A circle for people and groups, a square for Statim's bots; the network's mark at the corner. */
export function ChatAvatar({
  chat,
  selfId: _selfId,
  size = 40,
  network,
}: {
  chat: Chat;
  selfId: ParticipantId;
  size?: AvatarSize;
  network?: NetworkId;
}) {
  const colors = useThemeColors();
  const isBot = isLocalChat(chat.id);
  const bot = useBotAvatar(chat.id);

  const avatar = (
    <Avatar
      size={size}
      shape={isBot ? "square" : "circle"}
      label={chat.title.replace(/^#/, "")}
      image={bot.avatar ?? chat.avatarUri}
      emoji={bot.emoji}
    />
  );
  if (!network) return avatar;

  return (
    <View>
      {avatar}
      <View
        style={{
          position: "absolute",
          right: -2,
          bottom: -2,
          borderRadius: Radius.full,
          borderWidth: 2,
          borderColor: colors.bg,
        }}
      >
        <NetworkMark network={network} label={networkLabel(network)} />
      </View>
    </View>
  );
}

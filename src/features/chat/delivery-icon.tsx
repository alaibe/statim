import { View } from "react-native";
import { useAppearanceStore } from "@/core/app/appearance";
import type { Chat, ChatMessage } from "@/core/messaging/types";
import { Icon, type IconSize, type IconTone } from "@/design";

/** Read receipts are symmetric: with yours off, theirs are not shown either. */
export function useReadUpTo(chat: Chat | undefined): number {
  const shown = useAppearanceStore((s) => s.readReceipts);
  return shown ? (chat?.readUpTo ?? 0) : 0;
}

/** `tone` (or `color`) is for a message sent and not yet read; failed and read have their own. */
export function DeliveryIcon({
  message,
  read,
  size,
  tone = "subtle",
  color,
}: {
  message: Pick<ChatMessage, "status">;
  read: boolean;
  size: IconSize;
  tone?: IconTone;
  color?: string;
}) {
  if (message.status === "failed") return <Icon name="circle-alert" size={size} tone="danger" />;
  if (message.status === "sending") return <Icon name="clock" size={size} tone={tone} color={color} />;
  if (!read) return <Icon name="check" size={size} tone={tone} color={color} />;
  return (
    <View className="flex-row">
      <Icon name="check" size={size} tone="accent" />
      <View style={{ marginLeft: -size * 0.6 }}>
        <Icon name="check" size={size} tone="accent" />
      </View>
    </View>
  );
}

import { ScrollView, View } from "react-native";
import { contentPreview, formatTimestamp } from "@/core/messaging/preview";
import type { ChatMessage } from "@/core/messaging/types";
import { Button, Divider, Icon, Pressable, Radius, Shadow, Sheet, Text, useThemeColors } from "@/design";

export function PinnedMessages({
  messages,
  visible,
  onOpen,
  onClose,
  onUnpin,
  top,
}: {
  messages: readonly ChatMessage[];
  visible: boolean;
  onOpen(): void;
  onClose(): void;
  onUnpin?: (message: ChatMessage) => void;
  top: number;
}) {
  const colors = useThemeColors();
  const newest = messages[0];
  if (!newest) return null;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${messages.length} pinned messages`}
        onPress={onOpen}
        className="absolute left-3 right-3 flex-row items-center gap-2 px-3 py-2"
        style={{
          top,
          zIndex: 9,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors["line-strong"],
          backgroundColor: colors.panel,
          boxShadow: Shadow.popover,
        }}
      >
        <Icon name="pin" size={16} tone="accent" />
        <View className="min-w-0 flex-1">
          <Text variant="label" tone="accent">
            {messages.length === 1 ? "Pinned message" : `${messages.length} pinned messages`}
          </Text>
          <Text size="sm" tone="muted" numberOfLines={1}>
            {contentPreview(newest.content)}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} tone="muted" />
      </Pressable>
      <Sheet visible={visible} onClose={onClose} title="Pinned messages">
        <ScrollView style={{ maxHeight: 480 }}>
          {messages.map((message, index) => (
            <View key={message.id}>
              {index > 0 ? <Divider /> : null}
              <View className="gap-1 py-3">
                <Text variant="meta">{formatTimestamp(message.sentAt)}</Text>
                <Text selectable>
                  {message.content.kind === "text" ? message.content.text : contentPreview(message.content)}
                </Text>
                {onUnpin ? <Button label="Unpin" variant="ghost" size="sm" onPress={() => onUnpin(message)} /> : null}
              </View>
            </View>
          ))}
        </ScrollView>
      </Sheet>
    </>
  );
}

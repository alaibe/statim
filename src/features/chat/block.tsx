import { View } from "react-native";
import { errorMessage } from "@/core/errors";
import { useChatStore } from "@/core/messaging/chat-store";
import type { ChatId } from "@/core/messaging/types";
import { Button, ConfirmDialog, Text, toast } from "@/design";

export async function setBlocked(chatId: ChatId, blocked: boolean): Promise<boolean> {
  try {
    await useChatStore.getState().setBlocked(chatId, blocked);
    toast.success(blocked ? "Blocked the chat" : "Unblocked the chat");
    return true;
  } catch (error) {
    toast.error(errorMessage(error, blocked ? "Couldn’t block this chat" : "Couldn’t unblock this chat"));
    return false;
  }
}

export function BlockSheet({ chatId, name, onClose }: { chatId: ChatId; name: string; onClose: () => void }) {
  return (
    <ConfirmDialog
      visible
      onClose={onClose}
      label="Block"
      title={`Block ${name}?`}
      body="Nothing they send reaches you, and you cannot message them. The chat moves to Blocked, where you can unblock them."
      confirm={{
        testID: "confirm-block",
        label: `Block ${name}`,
        danger: true,
        onPress: async () => {
          if (await setBlocked(chatId, true)) onClose();
        },
      }}
    />
  );
}

export function BlockedBar({ chatId }: { chatId: ChatId }) {
  return (
    <View className="mx-4 mb-2 items-center gap-2">
      <Text size="sm" tone="muted" align="center">
        You blocked this person. Nothing they send reaches you.
      </Text>
      <Button testID="unblock" icon="ban" label="Unblock" onPress={() => void setBlocked(chatId, false)} />
    </View>
  );
}

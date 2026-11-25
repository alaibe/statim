import { FlashList } from "@shopify/flash-list";
import { View } from "react-native";
import { errorMessage } from "@/core/errors";
import { sessionFor, useChatStore } from "@/core/messaging/chat-store";
import { chatPermissions } from "@/core/messaging/permissions";
import { contentPreview } from "@/core/messaging/preview";
import type { ChatId, ChatMessage } from "@/core/messaging/types";
import { ListItem, Sheet, toast } from "@/design";
import { ChatAvatar } from "./chat-avatar";
import { useChatTitles } from "./use-display-names";

export function ForwardSheet({ message, from, onClose }: { message: ChatMessage; from: ChatId; onClose: () => void }) {
  const chats = useChatStore((s) => s.chats);
  const sessions = useChatStore((s) => s.sessions);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const targets = chats.filter((c) => c.id !== from && chatPermissions(c, sessionFor({ sessions }, c.id)).send);
  const { titleOf, selfIdOf } = useChatTitles(targets);

  return (
    <Sheet visible onClose={onClose} title="Forward to" subtitle={contentPreview(message.content)}>
      <View style={{ borderCurve: "continuous" }} className="max-h-[420px] overflow-hidden rounded-lg bg-panel">
        <FlashList
          data={targets}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ListItem
              testID={`forward-to-${item.id}`}
              title={titleOf(item)}
              leading={<ChatAvatar chat={item} selfId={selfIdOf(item)} size="sm" />}
              onPress={() => {
                onClose();
                sendMessage(item.id, message.content)
                  .then(() => toast.success("Forwarded"))
                  .catch((e) => toast.error(errorMessage(e, "Could not forward")));
              }}
            />
          )}
        />
      </View>
    </Sheet>
  );
}

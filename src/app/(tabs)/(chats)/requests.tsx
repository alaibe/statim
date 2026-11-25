import { FlashList } from "@shopify/flash-list";
import { Stack } from "expo-router";
import { useChatStore } from "@/core/messaging/chat-store";
import { splitRequests } from "@/core/messaging/folders";
import { messagePreview } from "@/core/messaging/preview";
import { EmptyState, Row, Screen, SwipeableRow } from "@/design";
import { ChatAvatar } from "@/features/chat/chat-avatar";
import { formatListTime } from "@/features/chat/list-time";
import { answerRequest } from "@/features/chat/requests";
import { useChatTitles } from "@/features/chat/use-display-names";
import { openChat } from "@/features/navigation/open";

export default function RequestsScreen() {
  const chats = useChatStore((s) => s.chats);
  const { requests } = splitRequests(chats);

  const { selfIdOf, titleOf } = useChatTitles(requests);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: "Requests" }} />

      {requests.length === 0 ? (
        <EmptyState
          boot="no requests"
          text="When someone new writes to you, their chat waits here until you accept it."
        />
      ) : (
        <FlashList
          data={requests}
          keyExtractor={(c) => c.id}
          contentInsetAdjustmentBehavior="automatic"
          renderItem={({ item }) => (
            <SwipeableRow
              left={[
                {
                  id: "accept",
                  label: "Accept",
                  icon: "circle-check",
                  onPress: () => answerRequest(item.id, "accepted"),
                },
              ]}
              right={[
                {
                  id: "decline",
                  label: "Decline",
                  icon: "circle-x",
                  destructive: true,
                  onPress: () => answerRequest(item.id, "declined"),
                },
              ]}
            >
              <Row
                testID={`request-${item.id}`}
                title={titleOf(item)}
                preview={messagePreview(item.lastMessage)}
                meta={item.lastMessage ? formatListTime(item.lastMessage.sentAt) : undefined}
                leading={<ChatAvatar chat={item} selfId={selfIdOf(item)} size={40} />}
                onPress={() => openChat(item.id)}
              />
            </SwipeableRow>
          )}
        />
      )}
    </Screen>
  );
}

import { View } from "react-native";
import { errorMessage } from "@/core/errors";
import { useChatStore } from "@/core/messaging/chat-store";
import { formatDayLabel } from "@/core/messaging/preview";
import type { ChatId, ParticipantId } from "@/core/messaging/types";
import { Avatar, FieldError, IconButton, Row, Section, Skeleton } from "@/design";
import { useAction } from "@/features/use-action";
import { useKeyedLoad } from "@/lib/use-keyed-load";

export function JoinRequests({ chatId, pending }: { chatId: ChatId; pending?: number }) {
  const getJoinRequests = useChatStore((s) => s.getJoinRequests);
  const processJoinRequest = useChatStore((s) => s.processJoinRequest);
  const requests = useKeyedLoad(chatId, getJoinRequests, pending);
  const answer = useAction(
    async (participantId: ParticipantId, approve: boolean) => {
      await processJoinRequest(chatId, participantId, approve);
      requests.update((pending) => pending.filter((request) => request.participantId !== participantId));
    },
    { success: "Answered the request", failure: "Could not handle join request" },
  );

  return (
    <Section label="Join requests" empty="No pending requests">
      {requests.error ? (
        <View className="px-4 py-3">
          <FieldError>{errorMessage(requests.error, "Could not load join requests")}</FieldError>
        </View>
      ) : requests.loading ? (
        <Skeleton rows={2} avatar />
      ) : (
        requests.value?.map((request) => (
          <Row
            key={request.participantId}
            title={request.name}
            preview={request.bio || formatDayLabel(request.requestedAt)}
            previewLines={2}
            leading={<Avatar label={request.name} size={28} />}
            trailing={
              <View className="flex-row">
                <IconButton
                  icon="check"
                  label={`Approve ${request.name}`}
                  tone="accent"
                  disabled={answer.busy}
                  onPress={() => void answer.run(request.participantId, true)}
                />
                <IconButton
                  icon="x"
                  label={`Decline ${request.name}`}
                  disabled={answer.busy}
                  onPress={() => void answer.run(request.participantId, false)}
                />
              </View>
            }
          />
        ))
      )}
    </Section>
  );
}

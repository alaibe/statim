import { View } from 'react-native';

import { Avatar, IconButton, ListItem, Section, Text } from '@/design';
import { errorMessage } from '@/core/errors';
import { useChatStore } from '@/core/messaging/chat-store';
import { formatDayLabel } from '@/core/messaging/preview';
import type { ParticipantId, ChatId } from '@/core/messaging/types';
import { useKeyedLoad } from '@/lib/use-keyed-load';

import { useAction } from '@/features/use-action';

export function JoinRequests({ chatId, pending }: { chatId: ChatId; pending?: number }) {
  const getJoinRequests = useChatStore((s) => s.getJoinRequests);
  const processJoinRequest = useChatStore((s) => s.processJoinRequest);
  const requests = useKeyedLoad(chatId, getJoinRequests, pending);
  const answer = useAction(
    async (participantId: ParticipantId, approve: boolean) => {
      await processJoinRequest(chatId, participantId, approve);
      requests.update((pending) =>
        pending.filter((request) => request.participantId !== participantId)
      );
    },
    { success: 'Done', failure: 'Could not handle join request' }
  );

  const note = requests.error
    ? errorMessage(requests.error, 'Could not load join requests')
    : requests.loading
      ? 'Loading requests…'
      : requests.value?.length === 0
        ? 'No pending requests'
        : null;

  return (
    <Section title="Join requests" surface="card" className="mb-5">
      {note ? (
        <Text variant="caption" className={requests.error ? 'px-4 py-3 text-danger' : 'px-4 py-3'}>
          {note}
        </Text>
      ) : (
        requests.value?.map((request) => (
          <ListItem
            key={request.participantId}
            title={request.name}
            subtitle={request.bio || formatDayLabel(request.requestedAt)}
            numberOfLinesSubtitle={2}
            leading={<Avatar seed={request.participantId} size="sm" />}
            trailing={
              <View className="flex-row">
                <IconButton
                  icon="checkmark"
                  label={`Approve ${request.name}`}
                  tone="brand"
                  disabled={answer.busy}
                  onPress={() => void answer.run(request.participantId, true)}
                />
                <IconButton
                  icon="close"
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

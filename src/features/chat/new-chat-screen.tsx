import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  Avatar,
  Badge,
  Button,
  Chip,
  ErrorText,
  Eyebrow,
  Field,
  Icon,
  IconButton,
  ModalHeader,
  Pressable,
  Screen,
  springLayout,
  Text,
} from '@/design';
import { useBack } from '@/features/navigation/use-back';
import { toneFor } from '@/features/protocols/presentation';
import { JoinPublicChat } from '@/features/chat/join-public-chat';
import { supports } from '@/core/messaging/capability';
import type { NetworkId } from '@/core/messaging/networks';
import type { Contact } from '@/features/contacts/contacts';
import type { Candidate } from './bridged-networks';
import { useDestinations, useNewChat, type Destination } from './use-new-chat';

export function NewChatScreen() {
  const goBack = useBack('/chats');
  const { sessions, contacts, available, destination, choose } = useDestinations();

  if (!destination) {
    return (
      <Screen className="px-gutter" edges={['top', 'bottom']}>
        <ModalHeader title="New message" onClose={goBack} />
        <Text variant="bodyMuted">Connecting…</Text>
      </Screen>
    );
  }
  return (
    <NewChatForm
      key={destination.id}
      destination={destination}
      available={available}
      contacts={contacts}
      canJoinPublic={supports(sessions[destination.descriptor.id], 'previewPublicChat')}
      onChoose={choose}
      onClose={goBack}
    />
  );
}

function NewChatForm({
  destination,
  available,
  contacts,
  canJoinPublic,
  onChoose,
  onClose,
}: {
  destination: Destination;
  available: Destination[];
  contacts: readonly Contact[];
  canJoinPublic: boolean;
  onChoose: (id: NetworkId) => void;
  onClose: () => void;
}) {
  const {
    draft,
    draftRef,
    participants,
    results,
    groupName,
    error,
    busy,
    isGroup,
    known,
    selectedIds,
    existingDm,
    changeDraft,
    addParticipant,
    toggle,
    removeParticipant,
    setTitle,
    start,
  } = useNewChat(destination, contacts);
  const { descriptor, adding } = destination;

  return (
    <Screen className="px-gutter" edges={['top', 'bottom']}>
      <ModalHeader title={isGroup ? 'New group' : 'New message'} onClose={onClose} />

      <KeyboardAvoidingView behavior="padding" className="flex-1 justify-between">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4">
          {available.length > 1 ? (
            <View className="gap-2">
              <Eyebrow>Protocol</Eyebrow>
              <View className="flex-row flex-wrap gap-2">
                {available.map((option) => (
                  <Chip
                    key={option.id}
                    testID={`new-chat-protocol-${option.id}`}
                    label={option.label}
                    selected={option.id === destination.id}
                    onPress={() => onChoose(option.id)}
                  />
                ))}
              </View>
              {destination.bridged ? (
                <View className="flex-row items-start gap-2">
                  <Badge label="Bridged" tone="warning" />
                  <Text variant="caption" className="flex-1">
                    {`Your Matrix bridge carries these chats to ${destination.label}. It reads the messages to pass them on.`}
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-start gap-2">
                  <Badge
                    label={descriptor.meta.properties.endToEndEncrypted ? 'Encrypted' : 'Not E2EE'}
                    tone={toneFor(descriptor.meta)}
                  />
                  <Text variant="caption" className="flex-1">
                    {descriptor.meta.trustModel}
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          <Text variant="bodyMuted">{hintFor(destination)}</Text>

          {adding === 'address' && descriptor.publicChats && canJoinPublic ? (
            <JoinPublicChat protocol={descriptor.id} copy={descriptor.publicChats} />
          ) : null}

          <View className="gap-1">
            <Eyebrow>
              {known.length > 0
                ? `People you have talked to on ${destination.label}`
                : `Nobody yet on ${destination.label}`}
            </Eyebrow>
            {known.length === 0 ? (
              <Text variant="caption">
                {adding === 'address'
                  ? `Paste ${descriptor.address.noun} below to start the first one. People you talk to on another protocol are listed under that protocol, because an id only means something to the network that made it.`
                  : 'Chats you have there show up here once the bridge has brought them over.'}
              </Text>
            ) : null}
            {known.map((entry) =>
              entry.kind === 'header' ? (
                <Text key={`h-${entry.letter}`} variant="micro" className="pl-1 pt-2">
                  {entry.letter}
                </Text>
              ) : (
                <PersonRow
                  key={entry.participantId}
                  person={entry}
                  selected={selectedIds.has(entry.participantId)}
                  onPress={() => toggle(entry)}
                />
              )
            )}
          </View>

          {adding ? (
            <View className="flex-row items-end gap-2">
              <Field
                testID="new-chat-input"
                containerClassName="flex-1"
                label={
                  adding === 'search'
                    ? `Search ${destination.label}`
                    : adding === 'lookup'
                      ? 'Username, phone or email'
                      : descriptor.address.label
                }
                placeholder={adding === 'address' ? descriptor.address.placeholder : undefined}
                ref={draftRef}
                onChangeText={changeDraft}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                returnKeyType="done"
                onSubmitEditing={() => void addParticipant()}
              />
              <IconButton
                testID="new-chat-add"
                icon={adding === 'search' ? 'search-outline' : 'add'}
                label={adding === 'search' ? 'Search' : 'Add participant'}
                tone="brand"
                onPress={() => void addParticipant()}
                disabled={draft.trim().length < (adding === 'search' ? 2 : 3) || busy}
                className="mb-0.5"
              />
            </View>
          ) : null}

          {results.map((person) => (
            <PersonRow
              key={person.participantId}
              person={person}
              selected={selectedIds.has(person.participantId)}
              onPress={() => toggle(person)}
            />
          ))}

          <ErrorText>{error}</ErrorText>

          {participants.length > 0 ? (
            <Animated.View layout={springLayout()} className="gap-2">
              <Eyebrow>{`${participants.length} participant${participants.length === 1 ? '' : 's'}`}</Eyebrow>

              {participants.map((r) => (
                <View
                  key={r.participantId}
                  className="flex-row items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5">
                  <Avatar seed={r.participantId} size="sm" />
                  <Text numberOfLines={1} className="flex-1 text-footnote">
                    {r.name}
                  </Text>
                  <IconButton
                    icon="close"
                    label={`Remove ${r.name}`}
                    size={18}
                    onPress={() => removeParticipant(r.participantId)}
                  />
                </View>
              ))}
            </Animated.View>
          ) : null}

          {isGroup ? (
            <Animated.View layout={springLayout()} className="gap-2">
              <Field
                testID="new-chat-title"
                label="Group name"
                placeholder={groupName}
                onChangeText={setTitle}
                returnKeyType="done"
              />
              <View className="flex-row items-start gap-2">
                <Badge
                  label={GROUP_BADGE[descriptor.meta.properties.groupModel].label}
                  tone={GROUP_BADGE[descriptor.meta.properties.groupModel].tone}
                />
                <Text variant="caption" className="flex-1">
                  {GROUP_BADGE[descriptor.meta.properties.groupModel].detail}
                </Text>
              </View>
            </Animated.View>
          ) : null}
        </ScrollView>

        <View className="gap-2 pb-4 pt-2">
          <Button
            testID="new-chat-start"
            label={
              isGroup
                ? `Create group of ${participants.length + 1}`
                : existingDm
                  ? 'Open chat'
                  : 'Start chatting'
            }
            size="md"
            fullWidth
            loading={busy}
            disabled={participants.length === 0}
            onPress={start}
          />
          <Button label="Cancel" tone="ghost" fullWidth onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PersonRow({
  person,
  selected,
  onPress,
}: {
  person: Candidate;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={person.name}
      onPress={onPress}
      className="min-h-tap flex-row items-center gap-3 py-1.5">
      <Avatar seed={person.name} size="md" />
      <View className="min-w-0 flex-1">
        <Text className="font-medium" numberOfLines={1}>
          {person.name}
        </Text>
        {person.detail ? (
          <Text variant="caption" numberOfLines={1}>
            {person.detail}
          </Text>
        ) : null}
      </View>
      <Icon
        name={selected ? 'checkmark-circle' : 'add-circle-outline'}
        size={20}
        tone={selected ? 'brand' : 'subtle'}
      />
    </Pressable>
  );
}

const GROUP_BADGE = {
  enforced: {
    label: 'Enforced roster',
    tone: 'success' as const,
    detail:
      'Membership changes are themselves encrypted messages, so everyone converges on the same roster.',
  },
  'participant-set': {
    label: 'No roster',
    tone: 'warning' as const,
    detail:
      'The group is whoever a message is addressed to. Nobody can be added or removed afterwards, and leaving is only local to your device.',
  },
};

function hintFor(destination: Destination): string {
  switch (destination.adding) {
    case 'address':
      return `${destination.descriptor.address.hint} Add more than one to make it a group.`;
    case 'search':
      return `Search ${destination.label} for someone, or pick someone you have talked to. Chats started here are one to one.`;
    case 'lookup':
      return `Add someone by their ${destination.label} username, phone or email, or pick someone you have talked to. Chats started here are one to one.`;
    case null:
      return `Pick someone you have talked to on ${destination.label}. The bridge cannot start new chats there.`;
  }
}

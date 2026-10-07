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
  const { hint, nobody, input } = addingFor(destination);

  return (
    <Screen className="px-gutter" edges={['top', 'bottom']}>
      <ModalHeader title={isGroup ? 'New group' : 'New message'} onClose={onClose} />

      <KeyboardAvoidingView behavior="padding" className="flex-1 justify-between">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4">
          {available.length > 1 ? (
            <ProtocolPicker destination={destination} available={available} onChoose={onChoose} />
          ) : null}

          <Text variant="bodyMuted">{hint}</Text>

          {adding === 'address' && descriptor.publicChats && canJoinPublic ? (
            <JoinPublicChat protocol={descriptor.id} copy={descriptor.publicChats} />
          ) : null}

          <KnownPeople
            network={destination.label}
            nobody={nobody}
            known={known}
            selectedIds={selectedIds}
            onToggle={toggle}
          />

          {input ? (
            <View className="flex-row items-end gap-2">
              <Field
                testID="new-chat-input"
                containerClassName="flex-1"
                label={input.label}
                placeholder={input.placeholder}
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
                icon={input.search ? 'search-outline' : 'add'}
                label={input.search ? 'Search' : 'Add participant'}
                tone="brand"
                onPress={() => void addParticipant()}
                disabled={draft.trim().length < (input.search ? 2 : 3) || busy}
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
            <Participants participants={participants} onRemove={removeParticipant} />
          ) : null}

          {isGroup ? (
            <GroupName
              placeholder={groupName}
              model={descriptor.meta.properties.groupModel}
              onChange={setTitle}
            />
          ) : null}
        </ScrollView>

        <View className="gap-2 pb-4 pt-2">
          <Button
            testID="new-chat-start"
            label={startLabel(isGroup, Boolean(existingDm), participants.length)}
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

function addingFor(destination: Destination) {
  const { label, descriptor } = destination;
  const { address } = descriptor;
  const bridged = 'Chats you have there show up here once the bridge has brought them over.';
  switch (destination.adding) {
    case 'address':
      return {
        hint: `${address.hint} Add more than one to make it a group.`,
        nobody: `Paste ${address.noun} below to start the first one. People you talk to on another protocol are listed under that protocol, because an id only means something to the network that made it.`,
        input: { label: address.label, placeholder: address.placeholder, search: false },
      };
    case 'search':
      return {
        hint: `Search ${label} for someone, or pick someone you have talked to. Chats started here are one to one.`,
        nobody: bridged,
        input: { label: `Search ${label}`, placeholder: undefined, search: true },
      };
    case 'lookup':
      return {
        hint: `Add someone by their ${label} username, phone or email, or pick someone you have talked to. Chats started here are one to one.`,
        nobody: bridged,
        input: { label: 'Username, phone or email', placeholder: undefined, search: false },
      };
    case null:
      return {
        hint: `Pick someone you have talked to on ${label}. The bridge cannot start new chats there.`,
        nobody: bridged,
        input: null,
      };
  }
}

function startLabel(isGroup: boolean, existingDm: boolean, count: number): string {
  if (isGroup) return `Create group of ${count + 1}`;
  return existingDm ? 'Open chat' : 'Start chatting';
}

function ProtocolPicker({
  destination,
  available,
  onChoose,
}: {
  destination: Destination;
  available: Destination[];
  onChoose: (id: NetworkId) => void;
}) {
  const { meta } = destination.descriptor;
  return (
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
      <View className="flex-row items-start gap-2">
        {destination.bridged ? (
          <Badge label="Bridged" tone="warning" />
        ) : (
          <Badge
            label={meta.properties.endToEndEncrypted ? 'Encrypted' : 'Not E2EE'}
            tone={toneFor(meta)}
          />
        )}
        <Text variant="caption" className="flex-1">
          {destination.bridged
            ? `Your Matrix bridge carries these chats to ${destination.label}. It reads the messages to pass them on.`
            : meta.trustModel}
        </Text>
      </View>
    </View>
  );
}

function KnownPeople({
  network,
  nobody,
  known,
  selectedIds,
  onToggle,
}: {
  network: string;
  nobody: string;
  known: ReturnType<typeof useNewChat>['known'];
  selectedIds: ReadonlySet<string>;
  onToggle: (person: Candidate) => void;
}) {
  if (known.length === 0) {
    return (
      <View className="gap-1">
        <Eyebrow>{`Nobody yet on ${network}`}</Eyebrow>
        <Text variant="caption">{nobody}</Text>
      </View>
    );
  }
  return (
    <View className="gap-1">
      <Eyebrow>{`People you have talked to on ${network}`}</Eyebrow>
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
            onPress={() => onToggle(entry)}
          />
        )
      )}
    </View>
  );
}

function Participants({
  participants,
  onRemove,
}: {
  participants: Candidate[];
  onRemove: (id: Candidate['participantId']) => void;
}) {
  return (
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
            onPress={() => onRemove(r.participantId)}
          />
        </View>
      ))}
    </Animated.View>
  );
}

function GroupName({
  placeholder,
  model,
  onChange,
}: {
  placeholder: string;
  model: keyof typeof GROUP_BADGE;
  onChange: (title: string) => void;
}) {
  const badge = GROUP_BADGE[model];
  return (
    <Animated.View layout={springLayout()} className="gap-2">
      <Field
        testID="new-chat-title"
        label="Group name"
        placeholder={placeholder}
        onChangeText={onChange}
        returnKeyType="done"
      />
      <View className="flex-row items-start gap-2">
        <Badge label={badge.label} tone={badge.tone} />
        <Text variant="caption" className="flex-1">
          {badge.detail}
        </Text>
      </View>
    </Animated.View>
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

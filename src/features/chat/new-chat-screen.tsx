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
import { useNewChat, type Destination } from './use-new-chat';

export function NewChatScreen() {
  const goBack = useBack('/chats');
  const {
    sessions,
    available,
    active,
    destination,
    adding,
    results,
    pickResult,
    descriptor,
    draft,
    draftRef,
    participants,
    groupName,
    error,
    busy,
    isGroup,
    known,
    selectedIds,
    existingDm,
    chooseProtocol,
    changeDraft,
    addParticipant,
    toggleParticipant,
    removeParticipant,
    setTitle,
    start,
  } = useNewChat();

  return (
    <Screen className="px-gutter" edges={['top', 'bottom']}>
      <ModalHeader title={isGroup ? 'New group' : 'New message'} onClose={goBack} />

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
                    selected={option.id === active}
                    onPress={() => chooseProtocol(option.id)}
                  />
                ))}
              </View>
              {destination && destination.id !== destination.descriptor.id ? (
                <View className="flex-row items-start gap-2">
                  <Badge label="Bridged" tone="warning" />
                  <Text variant="caption" className="flex-1">
                    {`Your Matrix bridge carries these chats to ${destination.label}. It reads the messages to pass them on.`}
                  </Text>
                </View>
              ) : descriptor ? (
                <View className="flex-row items-start gap-2">
                  <Badge
                    label={descriptor.meta.properties.endToEndEncrypted ? 'Encrypted' : 'Not E2EE'}
                    tone={toneFor(descriptor.meta)}
                  />
                  <Text variant="caption" className="flex-1">
                    {descriptor.meta.trustModel}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <Text variant="bodyMuted">
            {destination ? hintFor(destination, adding) : 'Connecting…'}
          </Text>

          {adding === 'address' &&
          descriptor?.publicChats &&
          supports(sessions[descriptor.id], 'previewPublicChat') ? (
            <JoinPublicChat key={active} protocol={descriptor.id} copy={descriptor.publicChats} />
          ) : null}

          {descriptor ? (
            <View className="gap-1">
              <Eyebrow>
                {known.length > 0
                  ? `People you have talked to on ${destination?.label}`
                  : `Nobody yet on ${destination?.label}`}
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
                  <Pressable
                    key={entry.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selectedIds.has(entry.id) }}
                    accessibilityLabel={entry.name}
                    onPress={() => toggleParticipant(entry.id, entry.name)}
                    className="min-h-tap flex-row items-center gap-3 py-1.5">
                    <Avatar seed={entry.name} size="md" />
                    <Text className="flex-1 font-medium" numberOfLines={1}>
                      {entry.name}
                    </Text>
                    <Icon
                      name={selectedIds.has(entry.id) ? 'checkmark-circle' : 'add-circle-outline'}
                      size={20}
                      tone={selectedIds.has(entry.id) ? 'brand' : 'subtle'}
                    />
                  </Pressable>
                )
              )}
            </View>
          ) : null}

          {adding ? (
            <View className="flex-row items-end gap-2">
              <Field
                testID="new-chat-input"
                containerClassName="flex-1"
                label={
                  adding === 'search'
                    ? `Search ${destination?.label}`
                    : adding === 'lookup'
                      ? 'Username, phone or email'
                      : (descriptor?.address.label ?? 'Address')
                }
                placeholder={adding === 'address' ? descriptor?.address.placeholder : undefined}
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
            <Pressable
              key={person.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selectedIds.has(person.mxid ?? person.id) }}
              accessibilityLabel={person.name ?? person.id}
              onPress={() => pickResult(person)}
              className="min-h-tap flex-row items-center gap-3 py-1.5">
              <Avatar seed={person.name ?? person.id} size="md" />
              <View className="min-w-0 flex-1">
                <Text className="font-medium" numberOfLines={1}>
                  {person.name ?? person.id}
                </Text>
                {person.identifiers?.[0] ? (
                  <Text variant="caption" numberOfLines={1}>
                    {person.identifiers[0]}
                  </Text>
                ) : null}
              </View>
              <Icon
                name={
                  selectedIds.has(person.mxid ?? person.id)
                    ? 'checkmark-circle'
                    : 'add-circle-outline'
                }
                size={20}
                tone={selectedIds.has(person.mxid ?? person.id) ? 'brand' : 'subtle'}
              />
            </Pressable>
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
                    {r.input}
                  </Text>
                  <IconButton
                    icon="close"
                    label={`Remove ${r.input}`}
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
              {descriptor ? (
                <View className="flex-row items-start gap-2">
                  <Badge
                    label={GROUP_BADGE[descriptor.meta.properties.groupModel].label}
                    tone={GROUP_BADGE[descriptor.meta.properties.groupModel].tone}
                  />
                  <Text variant="caption" className="flex-1">
                    {GROUP_BADGE[descriptor.meta.properties.groupModel].detail}
                  </Text>
                </View>
              ) : null}
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
            disabled={participants.length === 0 || !active}
            onPress={start}
          />
          <Button label="Cancel" tone="ghost" fullWidth onPress={goBack} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
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

function hintFor(destination: Destination, adding: 'address' | 'search' | 'lookup' | null): string {
  switch (adding) {
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

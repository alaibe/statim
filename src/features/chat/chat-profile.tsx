import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  Avatar,
  BackHeader,
  Badge,
  Card,
  Icon,
  Pressable,
  Screen,
  Text,
  copyText,
  type IconName,
} from '@/design';
import { shortAddress } from '@/core/account/keyring';
import { reportError } from '@/core/app/report-error';
import { prefsFor } from '@/core/messaging/chat-prefs';
import { selfIdFor, useChatStore } from '@/core/messaging/chat-store';
import { chatPermissions } from '@/core/messaging/permissions';
import { errorMessage } from '@/core/errors';
import { chatParticipants, chatTitle } from '@/core/messaging/display-names';
import type { Chat, ParticipantId } from '@/core/messaging/types';
import { useDisplayNames } from '@/features/chat/use-display-names';
import { useSupports } from '@/features/chat/use-supports';
import { useBack } from '@/features/navigation/use-back';
import { openChatFromProfile } from '@/features/navigation/open';
import { resolveEnsProfile } from '@/lib/evm/ens-profile';
import { protocolSubtitle } from '@/features/protocols/presentation';
import { JoinRequests } from '@/features/chat/join-requests';
import {
  GroupAbout,
  InviteLinks,
  MemberModeration,
  SlowModeSection,
} from '@/features/chat/group-sections';
import { useKeyedLoad } from '@/lib/use-keyed-load';
import { SharedMedia } from './shared-media';

const ensOf = (address: string) => resolveEnsProfile(address as `0x${string}`);

export function ChatProfile() {
  const { id, member } = useLocalSearchParams<{ id: string; member?: string }>();
  const goBack = useBack('/chats');
  const chat = useChatStore((s) => s.chats.find((c) => c.id === id));

  if (!chat) {
    return (
      <Screen className="px-0" edges={['top']}>
        <Stack.Screen options={{ headerShown: false }} />
        <BackHeader label="Back" onPress={goBack} />
        <Text variant="footnote" className="px-gutter">
          That chat is not loaded.
        </Text>
      </Screen>
    );
  }
  return <LoadedChatProfile chat={chat} member={member} goBack={goBack} />;
}

function LoadedChatProfile({
  chat,
  member,
  goBack,
}: {
  chat: Chat;
  member: ParticipantId | undefined;
  goBack: () => void;
}) {
  const sessions = useChatStore((s) => s.sessions);
  const muted = useChatStore((s) => Boolean(prefsFor(s.chatPrefs, chat.id).muted));
  const setChatPref = useChatStore((s) => s.setChatPref);
  const getGroupInfo = useChatStore((s) => s.getGroupInfo);

  const { session, supports } = useSupports(chat.id);
  const canGetGroupInfo = supports('getGroupInfo');
  const selfId = selfIdFor({ sessions }, chat.protocol);
  const participants = chatParticipants(chat, selfId);
  const { nameFor, addressFor } = useDisplayNames(participants);

  const [inviting, setInviting] = useState(false);
  const details = useKeyedLoad(
    chat.kind !== 'dm' && !member && canGetGroupInfo ? chat.id : null,
    getGroupInfo
  );

  const focusId = member ?? (chat.kind === 'dm' ? participants[0]?.id : undefined);
  const participantAddress = focusId ? addressFor(focusId) : undefined;
  const shownEns = useKeyedLoad(
    participantAddress?.startsWith('0x') ? participantAddress : null,
    ensOf
  ).value;

  const title = shownEns?.name ?? (member ? nameFor(member) : chatTitle(chat, selfId, nameFor));
  const permissions = chatPermissions(chat, session);
  const canRemove = Boolean(member) && member !== selfId && permissions.removeMembers;
  const groupInfo = details.value;
  const groupLink = groupInfo?.link;
  const canInvite = !member && permissions.invite;
  return (
    <Screen className="px-0" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <BackHeader label="Back" onPress={goBack} />

      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="items-center gap-3 px-gutter pb-5">
          <Avatar
            seed={focusId ?? chat.id}
            size="xl"
            label={!member && chat.kind !== 'dm' ? chat.title : undefined}
            image={groupInfo?.avatarUri ?? shownEns?.avatar ?? undefined}
          />

          <View className="items-center gap-1">
            <Text variant="headline">{title}</Text>
            {shownEns?.name ? (
              <Badge
                label={
                  shownEns.paidUntil
                    ? `ENS · held through ${shownEns.paidUntil.getFullYear()}`
                    : 'ENS name'
                }
                tone="success"
              />
            ) : null}
            <Text variant="micro">{protocolSubtitle(chat.protocol)}</Text>
            {groupInfo?.memberCount ? (
              <Text variant="caption">
                {groupInfo.memberCount} {chat.kind === 'channel' ? 'subscribers' : 'members'}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="flex-row justify-center gap-2 px-gutter pb-5">
          <Action
            icon="chatbubble-outline"
            label="Message"
            onPress={() => openChatFromProfile(chat.id)}
          />
          {member ? null : (
            <Action
              icon={muted ? 'volume-high-outline' : 'volume-mute-outline'}
              label={muted ? 'Unmute' : 'Mute'}
              onPress={() => void setChatPref(chat.id, { muted: !muted }).catch(reportError)}
            />
          )}
          {participantAddress || focusId || groupLink ? (
            <Action
              icon="copy-outline"
              label="Copy"
              onPress={() => void copyText(groupLink ?? participantAddress ?? focusId ?? '')}
            />
          ) : null}
          {canInvite ? (
            <Action icon="person-add-outline" label="Invite" onPress={() => setInviting(true)} />
          ) : null}
        </View>

        {participantAddress ? (
          <Card className="mx-gutter mb-5 gap-1">
            <Text variant="caption">Address</Text>
            <Text variant="mono" selectable>
              {shortAddress(participantAddress, 12, 10)}
            </Text>
            {shownEns?.description ? (
              <Text variant="footnote" className="pt-1">
                {shownEns.description}
              </Text>
            ) : null}
            {shownEns?.paidUntil ? (
              <Text variant="micro" className="pt-1">
                {shownEns.name} is registered until{' '}
                {shownEns.paidUntil.toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                . Anyone can pick a display name; only the holder can renew this one.
              </Text>
            ) : null}
          </Card>
        ) : null}

        {!member && (chat.kind === 'group' || chat.kind === 'channel') ? (
          <GroupAbout
            info={groupInfo}
            error={
              details.error ? errorMessage(details.error, 'Could not load details') : undefined
            }
          />
        ) : null}

        {canInvite ? (
          <InviteLinks chatId={chat.id} visible={inviting} onClose={() => setInviting(false)} />
        ) : null}

        {canInvite && supports('getJoinRequests') ? (
          <JoinRequests chatId={chat.id} pending={chat.pendingJoinRequests} />
        ) : null}

        {!member && groupInfo?.canSetSlowMode ? (
          <SlowModeSection
            chatId={chat.id}
            delay={groupInfo.slowModeDelay}
            onChanged={(seconds) => details.update((info) => ({ ...info, slowModeDelay: seconds }))}
          />
        ) : null}

        {canRemove && member ? (
          <MemberModeration
            chatId={chat.id}
            member={member}
            memberName={title}
            groupTitle={chat.title}
            onRemoved={goBack}
          />
        ) : null}

        {member ? null : <SharedMedia chatId={chat.id} />}
      </ScrollView>
    </Screen>
  );
}

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="min-w-[84px] items-center gap-1 rounded-card bg-surface-sunken px-3 py-2.5">
      <Icon name={icon} size={20} tone="brand" />
      <Text variant="micro" className="font-medium text-content">
        {label}
      </Text>
    </Pressable>
  );
}

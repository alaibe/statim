import { Stack, useLocalSearchParams } from 'expo-router';
import { type ReactNode, useState } from 'react';
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
import { type EnsProfile, resolveEnsProfile } from '@/lib/evm/ens-profile';
import { protocolSubtitle } from '@/features/protocols/presentation';
import { JoinRequests } from '@/features/chat/join-requests';
import {
  GroupAbout,
  InviteLinks,
  MemberModeration,
  SlowModeSection,
} from '@/features/chat/group-sections';
import { useKeyedLoad } from '@/lib/use-keyed-load';
import { BlockSheet, setBlocked } from './block';
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
  return member ? (
    <MemberProfile chat={chat} member={member} goBack={goBack} />
  ) : (
    <WholeChatProfile chat={chat} goBack={goBack} />
  );
}

function useChatPeople(chat: Chat) {
  const sessions = useChatStore((s) => s.sessions);
  const selfId = selfIdFor({ sessions }, chat.protocol);
  const participants = chatParticipants(chat, selfId);
  const { nameFor, addressFor } = useDisplayNames(participants);
  return { selfId, participants, nameFor, addressFor };
}

function useEns(address: string | undefined) {
  return useKeyedLoad(address?.startsWith('0x') ? address : null, ensOf).value;
}

function MemberProfile({
  chat,
  member,
  goBack,
}: {
  chat: Chat;
  member: ParticipantId;
  goBack: () => void;
}) {
  const { session } = useSupports(chat.id);
  const { selfId, nameFor, addressFor } = useChatPeople(chat);
  const address = addressFor(member);
  const ens = useEns(address);
  const title = ens?.name ?? nameFor(member);
  return (
    <ProfileScreen
      chat={chat}
      goBack={goBack}
      title={title}
      ens={ens}
      avatar={<Avatar seed={member} size="xl" image={ens?.avatar ?? undefined} />}
      actions={<CopyAction value={address || member} />}>
      {address ? <AddressCard address={address} ens={ens} /> : null}
      {member !== selfId && chatPermissions(chat, session).removeMembers ? (
        <MemberModeration
          chatId={chat.id}
          member={member}
          memberName={title}
          groupTitle={chat.title}
          onRemoved={goBack}
        />
      ) : null}
    </ProfileScreen>
  );
}

function WholeChatProfile({ chat, goBack }: { chat: Chat; goBack: () => void }) {
  const muted = useChatStore((s) => Boolean(prefsFor(s.chatPrefs, chat.id).muted));
  const setChatPref = useChatStore((s) => s.setChatPref);
  const getGroupInfo = useChatStore((s) => s.getGroupInfo);
  const { session, supports } = useSupports(chat.id);
  const { selfId, participants, nameFor, addressFor } = useChatPeople(chat);
  const focusId = chat.kind === 'dm' ? participants[0]?.id : undefined;
  const address = focusId ? addressFor(focusId) : undefined;
  const ens = useEns(address);
  const permissions = chatPermissions(chat, session);
  const [inviting, setInviting] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const details = useKeyedLoad(
    chat.kind !== 'dm' && supports('getGroupInfo') ? chat.id : null,
    getGroupInfo
  );
  const groupInfo = details.value;
  const title = ens?.name ?? chatTitle(chat, selfId, nameFor);
  return (
    <ProfileScreen
      chat={chat}
      goBack={goBack}
      title={title}
      ens={ens}
      memberCount={groupInfo?.memberCount}
      avatar={
        <Avatar
          seed={focusId ?? chat.id}
          size="xl"
          label={chat.kind !== 'dm' ? chat.title : undefined}
          image={groupInfo?.avatarUri ?? ens?.avatar ?? chat.avatarUri}
        />
      }
      actions={
        <>
          <Action
            icon={muted ? 'volume-high-outline' : 'volume-mute-outline'}
            label={muted ? 'Unmute' : 'Mute'}
            onPress={() => void setChatPref(chat.id, { muted: !muted }).catch(reportError)}
          />
          <CopyAction value={groupInfo?.link || address || focusId} />
          {permissions.invite ? (
            <Action icon="person-add-outline" label="Invite" onPress={() => setInviting(true)} />
          ) : null}
          {permissions.block ? (
            <Action
              icon="ban-outline"
              label={chat.blocked ? 'Unblock' : 'Block'}
              onPress={() => (chat.blocked ? void setBlocked(chat.id, false) : setBlocking(true))}
            />
          ) : null}
        </>
      }>
      {blocking ? (
        <BlockSheet chatId={chat.id} name={title} onClose={() => setBlocking(false)} />
      ) : null}

      {address ? <AddressCard address={address} ens={ens} /> : null}

      {chat.kind === 'group' || chat.kind === 'channel' ? (
        <GroupAbout
          info={groupInfo}
          error={details.error ? errorMessage(details.error, 'Could not load details') : undefined}
        />
      ) : null}
      {permissions.invite ? (
        <>
          <InviteLinks chatId={chat.id} visible={inviting} onClose={() => setInviting(false)} />
          {supports('getJoinRequests') ? (
            <JoinRequests chatId={chat.id} pending={chat.pendingJoinRequests} />
          ) : null}
        </>
      ) : null}
      {groupInfo?.canSetSlowMode ? (
        <SlowModeSection
          chatId={chat.id}
          delay={groupInfo.slowModeDelay}
          onChanged={(seconds) => details.update((info) => ({ ...info, slowModeDelay: seconds }))}
        />
      ) : null}
      <SharedMedia chatId={chat.id} />
    </ProfileScreen>
  );
}

function ProfileScreen({
  chat,
  goBack,
  avatar,
  title,
  ens,
  memberCount,
  actions,
  children,
}: {
  chat: Chat;
  goBack: () => void;
  avatar: ReactNode;
  title: string;
  ens: EnsProfile | null | undefined;
  memberCount?: number;
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <Screen className="px-0" edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <BackHeader label="Back" onPress={goBack} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="items-center gap-3 px-gutter pb-5">
          {avatar}
          <ProfileTitle chat={chat} title={title} ens={ens} memberCount={memberCount} />
        </View>
        <View className="flex-row justify-center gap-2 px-gutter pb-5">
          <Action
            icon="chatbubble-outline"
            label="Message"
            onPress={() => openChatFromProfile(chat.id)}
          />
          {actions}
        </View>
        {children}
      </ScrollView>
    </Screen>
  );
}

function ProfileTitle({
  chat,
  title,
  ens,
  memberCount,
}: {
  chat: Chat;
  title: string;
  ens: EnsProfile | null | undefined;
  memberCount?: number;
}) {
  return (
    <View className="items-center gap-1">
      <Text variant="headline">{title}</Text>
      {ens?.name ? (
        <Badge
          label={ens.paidUntil ? `ENS · held through ${ens.paidUntil.getFullYear()}` : 'ENS name'}
          tone="success"
        />
      ) : null}
      <Text variant="micro">{protocolSubtitle(chat.protocol)}</Text>
      {memberCount ? (
        <Text variant="caption">
          {memberCount} {chat.kind === 'channel' ? 'subscribers' : 'members'}
        </Text>
      ) : null}
    </View>
  );
}

function AddressCard({ address, ens }: { address: string; ens: EnsProfile | null | undefined }) {
  return (
    <Card className="mx-gutter mb-5 gap-1">
      <Text variant="caption">Address</Text>
      <Text variant="mono" selectable>
        {shortAddress(address, 12, 10)}
      </Text>
      {ens?.description ? (
        <Text variant="footnote" className="pt-1">
          {ens.description}
        </Text>
      ) : null}
      {ens?.paidUntil ? (
        <Text variant="micro" className="pt-1">
          {ens.name} is registered until{' '}
          {ens.paidUntil.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
          . Anyone can pick a display name; only the holder can renew this one.
        </Text>
      ) : null}
    </Card>
  );
}

function CopyAction({ value }: { value: string | undefined }) {
  if (!value) return null;
  return <Action icon="copy-outline" label="Copy" onPress={() => void copyText(value)} />;
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

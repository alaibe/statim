import { Stack, useLocalSearchParams } from "expo-router";
import { type ReactNode, useState } from "react";
import { ScrollView, View } from "react-native";
import { shortAddress } from "@/core/account/keyring";
import { reportError } from "@/core/app/report-error";
import { errorMessage } from "@/core/errors";
import { prefsFor } from "@/core/messaging/chat-prefs";
import { selfIdFor, useChatStore } from "@/core/messaging/chat-store";
import { chatParticipants, chatTitle } from "@/core/messaging/display-names";
import type { Chat, ParticipantId } from "@/core/messaging/types";
import {
  Avatar,
  Button,
  copyText,
  desktop,
  IconButton,
  type IconName,
  Notice,
  PhoneHeader,
  Screen,
  Section,
  Tag,
  Text,
} from "@/design";
import { GroupAbout, InviteLinks, MemberModeration, SlowModeSection } from "@/features/chat/group-sections";
import { JoinRequests } from "@/features/chat/join-requests";
import { useChatPermissions } from "@/features/chat/use-chat-permissions";
import { useDisplayNames } from "@/features/chat/use-display-names";
import { openChatFromProfile } from "@/features/navigation/open";
import { useBack } from "@/features/navigation/use-back";
import { protocolSubtitle } from "@/features/protocols/presentation";
import { type EnsProfile, resolveEnsProfile } from "@/lib/evm/ens-profile";
import { useKeyedLoad } from "@/lib/use-keyed-load";
import { BlockSheet, setBlocked } from "./block";
import { SharedMedia } from "./shared-media";

const ensOf = (address: string) => resolveEnsProfile(address as `0x${string}`);

export function ChatProfile() {
  const { id, member } = useLocalSearchParams<{ id: string; member?: string }>();
  const goBack = useBack("/chats");
  const chat = useChatStore((s) => s.chats.find((c) => c.id === id));

  if (!chat) {
    return (
      <Screen edges={[]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ProfileHeader goBack={goBack} />
        <View className="p-4">
          <Notice tone="warning" message="That chat isn’t loaded." action={{ label: "Back", onPress: goBack }} />
        </View>
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
  return useKeyedLoad(address?.startsWith("0x") ? address : null, ensOf).value;
}

function MemberProfile({ chat, member, goBack }: { chat: Chat; member: ParticipantId; goBack: () => void }) {
  const { removeMembers } = useChatPermissions(chat.id);
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
      avatar={<Avatar size={64} label={title} image={ens?.avatar ?? undefined} />}
      actions={<CopyAction value={address || member} />}
    >
      {address ? <AddressCard address={address} ens={ens} /> : null}
      {member !== selfId && removeMembers ? (
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
  const { selfId, participants, nameFor, addressFor } = useChatPeople(chat);
  const focusId = chat.kind === "dm" ? participants[0]?.id : undefined;
  const address = focusId ? addressFor(focusId) : undefined;
  const ens = useEns(address);
  const permissions = useChatPermissions(chat.id);
  const [inviting, setInviting] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const details = useKeyedLoad(permissions.seeGroupInfo ? chat.id : null, getGroupInfo);
  const groupInfo = details.value;
  const title = ens?.name ?? chatTitle(chat, selfId, nameFor);
  return (
    <ProfileScreen
      chat={chat}
      goBack={goBack}
      title={title}
      ens={ens}
      memberCount={groupInfo?.memberCount}
      avatar={<Avatar size={64} label={title} image={groupInfo?.avatarUri ?? ens?.avatar ?? chat.avatarUri} />}
      actions={
        <>
          <Action
            icon={muted ? "volume-2" : "volume-x"}
            label={muted ? "Unmute" : "Mute"}
            onPress={() => void setChatPref(chat.id, { muted: !muted }).catch(reportError)}
          />
          <CopyAction value={groupInfo?.link || address || focusId} />
          {permissions.invite ? <Action icon="user-plus" label="Invite" onPress={() => setInviting(true)} /> : null}
          {permissions.block ? (
            <Action
              icon="ban"
              label={chat.blocked ? "Unblock" : "Block…"}
              onPress={() => (chat.blocked ? void setBlocked(chat.id, false) : setBlocking(true))}
            />
          ) : null}
        </>
      }
    >
      {blocking ? <BlockSheet chatId={chat.id} name={title} onClose={() => setBlocking(false)} /> : null}

      {address ? <AddressCard address={address} ens={ens} /> : null}

      {chat.kind === "group" || chat.kind === "channel" ? (
        <GroupAbout
          info={groupInfo}
          error={details.error ? errorMessage(details.error, "Couldn’t load the details") : undefined}
        />
      ) : null}
      {permissions.invite ? (
        <>
          <InviteLinks chatId={chat.id} visible={inviting} onClose={() => setInviting(false)} />
          {permissions.answerJoinRequests ? <JoinRequests chatId={chat.id} pending={chat.pendingJoinRequests} /> : null}
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
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ProfileHeader goBack={goBack} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <View className="items-center gap-3 px-4 pb-6 pt-6">
          {avatar}
          <ProfileTitle chat={chat} title={title} ens={ens} memberCount={memberCount} />
        </View>
        <View className="flex-row flex-wrap justify-center gap-2 px-4 pb-6">
          <Button
            variant="primary"
            icon="message-square"
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
      <Text variant="title" align="center">
        {title}
      </Text>
      {ens?.name ? <Tag tone="ok" label={ens.paidUntil ? `ENS ${ens.paidUntil.getFullYear()}` : "ENS"} /> : null}
      <Text variant="label">{protocolSubtitle(chat.protocol)}</Text>
      {memberCount ? (
        <Text variant="meta">
          {memberCount} {chat.kind === "channel" ? "subscribers" : "members"}
        </Text>
      ) : null}
    </View>
  );
}

function AddressCard({ address, ens }: { address: string; ens: EnsProfile | null | undefined }) {
  return (
    <View className="mb-6">
      <Section label="Address">
        <View className="gap-2 px-4 py-3">
          <Text variant="code" selectable>
            {shortAddress(address, 12, 10)}
          </Text>
          {ens?.description ? <Text tone="muted">{ens.description}</Text> : null}
          {ens?.paidUntil ? (
            <Text size="sm" tone="muted">
              {ens.name} is registered until{" "}
              {ens.paidUntil.toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              . Anyone can pick a display name; only the holder can renew this one.
            </Text>
          ) : null}
        </View>
      </Section>
    </View>
  );
}

function CopyAction({ value }: { value: string | undefined }) {
  if (!value) return null;
  return <Action icon="copy" label="Copy" onPress={() => void copyText(value)} />;
}

function Action({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return <Button icon={icon} label={label} onPress={onPress} />;
}

/** Back on a phone; on the desktop the profile is a dialog, closed from its corner. */
function ProfileHeader({ goBack }: { goBack: () => void }) {
  if (desktop) {
    return (
      <View className="flex-row justify-end p-2">
        <IconButton icon="x" label="Close" keys={["esc"]} onPress={goBack} />
      </View>
    );
  }
  return <PhoneHeader title="Profile" onBack={goBack} />;
}

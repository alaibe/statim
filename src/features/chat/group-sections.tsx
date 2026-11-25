import { useState } from "react";
import { View } from "react-native";
import { useChatStore } from "@/core/messaging/chat-store";
import type { GroupInfo } from "@/core/messaging/protocol";
import type { ChatId, ParticipantId } from "@/core/messaging/types";
import {
  ConfirmDialog,
  copyText,
  type IconName,
  Menu,
  Notice,
  Pressable,
  Section,
  SettingsRow,
  Text,
  toast,
} from "@/design";
import { useAction } from "@/features/use-action";
import { useKeyedLoad } from "@/lib/use-keyed-load";
import { useChatPermissions } from "./use-chat-permissions";

const SLOW_MODE: { seconds: number; label: string }[] = [
  { seconds: 0, label: "Off" },
  { seconds: 5, label: "5 seconds" },
  { seconds: 10, label: "10 seconds" },
  { seconds: 30, label: "30 seconds" },
  { seconds: 60, label: "1 minute" },
  { seconds: 300, label: "5 minutes" },
  { seconds: 900, label: "15 minutes" },
  { seconds: 3600, label: "1 hour" },
];

export function GroupAbout({ info, error }: { info?: GroupInfo; error?: string }) {
  if (!info?.description && !info?.link && !error) return null;
  return (
    <View className="mb-6 gap-3">
      {error ? (
        <View className="px-4">
          <Notice tone="danger" message={error} />
        </View>
      ) : null}
      {info?.description || info?.link ? (
        <Section label="About">
          {info?.description ? (
            <View className="px-4 py-3">
              <Text selectable>{info.description}</Text>
            </View>
          ) : null}
          {info?.link ? <LinkRow label="Link" link={info.link} /> : null}
        </Section>
      ) : null}
    </View>
  );
}

function LinkRow({ label, link }: { label: string; link: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label.toLowerCase()}`}
      onPress={() => void copyText(link, "Link copied")}
      className="gap-1 px-4 py-3"
    >
      <Text variant="label">{label}</Text>
      <Text variant="code" tone="accent" selectable>
        {link}
      </Text>
    </Pressable>
  );
}

export function InviteLinks({ chatId, visible, onClose }: { chatId: ChatId; visible: boolean; onClose: () => void }) {
  const createInviteLink = useChatStore((s) => s.createInviteLink);
  const [created, setCreated] = useState<{ link: string; approval: boolean } | null>(null);
  const create = useAction(
    async (approval: boolean) => {
      const link = await createInviteLink(chatId, approval);
      setCreated({ link, approval });
      await copyText(link, approval ? "Copied the approval link" : "Copied the invite link");
    },
    { failure: "Couldn’t create an invite link" },
  );

  return (
    <>
      {created ? (
        <View className="mb-6">
          <Section label={created.approval ? "Approval link" : "Invite link"}>
            <LinkRow label="Copied" link={created.link} />
          </Section>
        </View>
      ) : null}
      <Menu
        visible={visible}
        onClose={onClose}
        title="Invite people"
        items={[
          {
            label: "Create invite link",
            icon: "link",
            onPress: () => create.run(false),
          },
          {
            label: "Create link that needs approval",
            icon: "user-plus",
            onPress: () => create.run(true),
          },
        ]}
      />
    </>
  );
}

export function SlowModeSection({
  chatId,
  delay,
  onChanged,
}: {
  chatId: ChatId;
  delay?: number;
  onChanged: (seconds: number) => void;
}) {
  const setSlowModeDelay = useChatStore((s) => s.setSlowModeDelay);
  const [open, setOpen] = useState(false);
  const change = useAction(
    async (seconds: number) => {
      await setSlowModeDelay(chatId, seconds);
      onChanged(seconds);
    },
    { success: "Updated slow mode", failure: "Couldn’t update slow mode" },
  );

  return (
    <View className="mb-6">
      <Section label="Moderation">
        <SettingsRow
          label="Slow mode"
          value={SLOW_MODE.find((option) => option.seconds === delay)?.label ?? "Off"}
          icon="clock"
          onPress={() => setOpen(true)}
        />
      </Section>
      <Menu
        visible={open}
        onClose={() => setOpen(false)}
        title="Slow mode"
        items={SLOW_MODE.map((option) => ({
          label: option.label,
          selected: option.seconds === delay,
          onPress: () => change.run(option.seconds),
        }))}
      />
    </View>
  );
}

type Removal = "remove" | "ban";

const REMOVAL: Record<
  Removal,
  { title: string; subtitle: string; confirm: string; body: string; done: string; icon: IconName }
> = {
  remove: {
    title: "Remove from group",
    subtitle: "They can come back with an invite or a link.",
    confirm: "Remove",
    body: "They stop receiving messages from this group. Nothing they already received is recalled, and they can come back with an invite or a link.",
    done: "Removed them from the group",
    icon: "user-minus",
  },
  ban: {
    title: "Ban from group",
    subtitle: "They are removed and cannot come back.",
    confirm: "Ban",
    body: "They stop receiving messages from this group and cannot join again, even with a link, until an admin lets them back in from another app.",
    done: "Banned them from the group",
    icon: "ban",
  },
};

export function MemberModeration({
  chatId,
  member,
  memberName,
  groupTitle,
  onRemoved,
}: {
  chatId: ChatId;
  member: ParticipantId;
  memberName: string;
  groupTitle: string;
  onRemoved: () => void;
}) {
  const can = useChatPermissions(chatId);
  const getMembers = useChatStore((s) => s.getMembers);
  const removeMembers = useChatStore((s) => s.removeMembers);
  const banMember = useChatStore((s) => s.banMember);
  const setMemberMuted = useChatStore((s) => s.setMemberMuted);
  const members = useKeyedLoad(can.muteMembers ? chatId : null, getMembers);
  const muted = members.value?.find((m) => m.id === member)?.muted ?? false;
  const [confirming, setConfirming] = useState<Removal | null>(null);

  const mute = useAction(
    async () => {
      await setMemberMuted(chatId, member, !muted);
      members.update((list) => list.map((m) => (m.id === member ? { ...m, muted: !muted } : m)));
    },
    { success: muted ? "Unmuted them" : "Muted them", failure: "Couldn’t change that" },
  );
  const remove = useAction(
    (removal: Removal) => (removal === "ban" ? banMember(chatId, member) : removeMembers(chatId, [member])),
    { failure: "Couldn’t do that" },
  );
  const removals: Removal[] = can.ban ? ["remove", "ban"] : ["remove"];

  return (
    <View className="mb-6">
      <Section label="Moderation">
        {can.muteMembers ? (
          <SettingsRow
            testID="profile-mute-member"
            label={muted ? "Let them send messages" : "Mute in group"}
            description={muted ? "They are muted: they read but cannot send." : "They stay, but cannot send."}
            icon={muted ? "mic" : "mic-off"}
            disabled={members.loading}
            onPress={() => mute.run()}
          />
        ) : null}
        {removals.map((removal) => (
          <SettingsRow
            key={removal}
            testID={`profile-${removal}-member`}
            label={`${REMOVAL[removal].title}…`}
            description={REMOVAL[removal].subtitle}
            icon={REMOVAL[removal].icon}
            danger
            onPress={() => setConfirming(removal)}
          />
        ))}
      </Section>
      {confirming ? (
        <ConfirmDialog
          visible
          onClose={() => setConfirming(null)}
          label={REMOVAL[confirming].title}
          title={`${REMOVAL[confirming].confirm} ${memberName} from ${groupTitle}?`}
          body={REMOVAL[confirming].body}
          confirm={{
            testID: "confirm-remove-member",
            label: `${REMOVAL[confirming].confirm} ${memberName}`,
            danger: true,
            onPress: async () => {
              if (!(await remove.run(confirming))) return;
              toast.success(REMOVAL[confirming].done);
              setConfirming(null);
              onRemoved();
            },
          }}
        />
      ) : null}
    </View>
  );
}

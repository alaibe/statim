import { useState } from 'react';
import { View } from 'react-native';

import {
  ActionSheet,
  Card,
  ConfirmSheet,
  copyText,
  ErrorText,
  type IconName,
  ListItem,
  Pressable,
  RowIcon,
  Section,
  Text,
  toast,
} from '@/design';
import { useChatStore } from '@/core/messaging/chat-store';
import type { GroupInfo } from '@/core/messaging/protocol';
import type { ChatId, ParticipantId } from '@/core/messaging/types';

import { useKeyedLoad } from '@/lib/use-keyed-load';

import { useAction } from '@/features/use-action';
import { useChatPermissions } from './use-chat-permissions';

const SLOW_MODE: { seconds: number; label: string }[] = [
  { seconds: 0, label: 'Off' },
  { seconds: 5, label: '5 seconds' },
  { seconds: 10, label: '10 seconds' },
  { seconds: 30, label: '30 seconds' },
  { seconds: 60, label: '1 minute' },
  { seconds: 300, label: '5 minutes' },
  { seconds: 900, label: '15 minutes' },
  { seconds: 3600, label: '1 hour' },
];

export function GroupAbout({ info, error }: { info?: GroupInfo; error?: string }) {
  if (!info?.description && !info?.link && !error) return null;
  return (
    <Card className="mx-gutter mb-5 gap-3">
      {info?.description ? (
        <View className="gap-1">
          <Text variant="caption">About</Text>
          <Text selectable>{info.description}</Text>
        </View>
      ) : null}
      {info?.link ? <LinkRow label="Link" link={info.link} /> : null}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function LinkRow({ label, link }: { label: string; link: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Copy ${label.toLowerCase()}`}
      onPress={() => void copyText(link, 'Link copied')}
      className="gap-1">
      <Text variant="caption">{label}</Text>
      <Text className="text-brand" selectable>
        {link}
      </Text>
    </Pressable>
  );
}

export function InviteLinks({
  chatId,
  visible,
  onClose,
}: {
  chatId: ChatId;
  visible: boolean;
  onClose: () => void;
}) {
  const createInviteLink = useChatStore((s) => s.createInviteLink);
  const [created, setCreated] = useState<{ link: string; approval: boolean } | null>(null);
  const create = useAction(
    async (approval: boolean) => {
      const link = await createInviteLink(chatId, approval);
      setCreated({ link, approval });
      await copyText(link, approval ? 'Approval link copied' : 'Invite link copied');
    },
    { failure: 'Could not create invite link' }
  );

  return (
    <>
      {created ? (
        <Card className="mx-gutter mb-5">
          <LinkRow
            label={`${created.approval ? 'Approval link' : 'Invite link'} · copied`}
            link={created.link}
          />
        </Card>
      ) : null}
      <ActionSheet
        visible={visible}
        onClose={onClose}
        title="Invite people"
        actions={[
          {
            label: 'Create invite link',
            icon: 'link-outline',
            onPress: () => create.run(false),
          },
          {
            label: 'Create link that needs approval',
            icon: 'person-add-outline',
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
    { success: 'Slow mode updated', failure: 'Could not update slow mode' }
  );

  return (
    <Section title="Moderation" surface="card" className="mb-5">
      <ListItem
        title="Slow mode"
        subtitle={SLOW_MODE.find((option) => option.seconds === delay)?.label ?? 'Off'}
        leading={<RowIcon name="time-outline" />}
        onPress={() => setOpen(true)}
      />
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Slow mode"
        actions={SLOW_MODE.map((option) => ({
          label: option.label,
          selected: option.seconds === delay,
          onPress: () => change.run(option.seconds),
        }))}
      />
    </Section>
  );
}

type Removal = 'remove' | 'ban';

const REMOVAL: Record<
  Removal,
  { title: string; subtitle: string; confirm: string; body: string; done: string; icon: IconName }
> = {
  remove: {
    title: 'Remove from group',
    subtitle: 'They can come back with an invite or a link.',
    confirm: 'Remove',
    body: 'They stop receiving messages from this group. Nothing they already received is recalled, and they can come back with an invite or a link.',
    done: 'Removed',
    icon: 'person-remove-outline',
  },
  ban: {
    title: 'Ban from group',
    subtitle: 'They are removed and cannot come back.',
    confirm: 'Ban',
    body: 'They stop receiving messages from this group and cannot join again, even with a link, until an admin lets them back in from another app.',
    done: 'Banned',
    icon: 'ban-outline',
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
    { success: muted ? 'They can send again' : 'Muted', failure: 'Could not change that' }
  );
  const remove = useAction(
    (removal: Removal) =>
      removal === 'ban' ? banMember(chatId, member) : removeMembers(chatId, [member]),
    { failure: 'Could not do that' }
  );
  const removals: Removal[] = can.ban ? ['remove', 'ban'] : ['remove'];

  return (
    <Section surface="card" className="mb-5">
      {can.muteMembers ? (
        <ListItem
          testID="profile-mute-member"
          title={muted ? 'Let them send messages' : 'Mute in group'}
          subtitle={
            muted ? 'They are muted: they read but cannot send.' : 'They stay, but cannot send.'
          }
          leading={<RowIcon name={muted ? 'mic-outline' : 'mic-off-outline'} />}
          onPress={members.loading ? undefined : () => mute.run()}
        />
      ) : null}
      {removals.map((removal) => (
        <ListItem
          key={removal}
          testID={`profile-${removal}-member`}
          title={REMOVAL[removal].title}
          subtitle={REMOVAL[removal].subtitle}
          numberOfLinesSubtitle={2}
          leading={<RowIcon name={REMOVAL[removal].icon} tone="red" />}
          onPress={() => setConfirming(removal)}
        />
      ))}
      {confirming ? (
        <ConfirmSheet
          visible
          onClose={() => setConfirming(null)}
          title={`${REMOVAL[confirming].confirm} ${memberName} from ${groupTitle}?`}
          body={REMOVAL[confirming].body}
          confirm={{
            testID: 'confirm-remove-member',
            label: REMOVAL[confirming].title,
            tone: 'danger',
            onPress: async () => {
              if (!(await remove.run(confirming))) return;
              toast.success(REMOVAL[confirming].done);
              setConfirming(null);
              onRemoved();
            },
          }}
        />
      ) : null}
    </Section>
  );
}

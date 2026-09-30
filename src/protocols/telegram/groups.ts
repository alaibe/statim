import type { GroupInfo, MentionCandidate } from '@/core/messaging/protocol';
import type {
  ProtocolChatId,
  GroupMember,
  ParticipantId,
  ProtocolChat,
} from '@/core/messaging/types';

import type { TdObject } from './api';
import type {
  TdBasicGroup,
  TdBasicGroupFullInfo,
  TdChat,
  TdChatMembers,
  TdSupergroup,
} from './types';
import { localFile } from './files';
import type { TelegramHost } from './service-host';
import { nameOf } from './users';
import { userSender } from './ids';

const NO_PERMISSIONS = {
  '@type': 'chatPermissions',
  can_send_basic_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_link_previews: false,
  can_react_to_messages: false,
  can_edit_tag: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false,
  can_create_topics: false,
};

export class TelegramGroups {
  constructor(private readonly host: TelegramHost) {}

  async createGroup(participants: ParticipantId[], title: string): Promise<ProtocolChat> {
    const created = await this.host.api().send<TdObject>({
      '@type': 'createNewBasicGroupChat',
      user_ids: participants.map(Number),
      title,
    });
    const chatId =
      created['@type'] === 'chat' ? (created as TdChat).id : (created.chat_id as number);
    return this.host.toChat(await this.host.td.requireChat(chatId));
  }

  async getMembers(id: ProtocolChatId): Promise<GroupMember[]> {
    return this.host.td.membersOf(await this.host.td.requireChat(Number(id)));
  }

  async mentionCandidates(id: ProtocolChatId, query: string): Promise<MentionCandidate[]> {
    const found = await this.host.api().send<TdChatMembers>({
      '@type': 'searchChatMembers',
      chat_id: Number(id),
      query,
      limit: 20,
      filter: null,
    });
    const users = await Promise.all(
      found.members.map(async (member) => {
        const sender = member.member_id;
        if (sender['@type'] !== 'messageSenderUser' || sender.user_id === this.host.selfUserId())
          return null;
        const user = await this.host.td.userFor(String(sender.user_id));
        if (!user) return null;
        const username = user.usernames?.active_usernames[0];
        return {
          id: String(user.id),
          name: nameOf(user),
          ...(username ? { address: `@${username}` } : {}),
        };
      })
    );
    return users.filter((user): user is MentionCandidate => user !== null);
  }

  async getGroupInfo(id: ProtocolChatId): Promise<GroupInfo> {
    const chat = await this.host.td.requireChat(Number(id));
    const type = chat.type;
    let description = '';
    let link: string | undefined;
    let memberCount: number | undefined;
    let slowModeDelay: number | undefined;
    let canSetSlowMode = false;

    if (type['@type'] === 'chatTypeBasicGroup') {
      const [group, info] = await Promise.all([
        this.host.api().send<TdBasicGroup>({
          '@type': 'getBasicGroup',
          basic_group_id: type.basic_group_id,
        }),
        this.host.api().send<TdBasicGroupFullInfo>({
          '@type': 'getBasicGroupFullInfo',
          basic_group_id: type.basic_group_id,
        }),
      ]);
      description = info.description ?? '';
      this.host.td.basicGroups.set(group.id, group);
      link = info.invite_link?.invite_link;
      memberCount = group.member_count || info.members.length;
    } else if (type['@type'] === 'chatTypeSupergroup') {
      const [group, info] = await Promise.all([
        this.host.api().send<TdSupergroup>({
          '@type': 'getSupergroup',
          supergroup_id: type.supergroup_id,
        }),
        this.host.api().send<{
          '@type': string;
          description?: string;
          member_count?: number;
          slow_mode_delay?: number;
          invite_link?: { invite_link: string };
        }>({ '@type': 'getSupergroupFullInfo', supergroup_id: type.supergroup_id }),
      ]);
      description = info.description ?? '';
      this.host.td.supergroups.set(group.id, group);
      const username = group.usernames?.active_usernames[0];
      link = username ? `https://t.me/${username}` : info.invite_link?.invite_link;
      memberCount = info.member_count || group.member_count || undefined;
      if (!type.is_channel) {
        slowModeDelay = info.slow_mode_delay ?? 0;
        canSetSlowMode =
          group.status['@type'] === 'chatMemberStatusCreator' ||
          (group.status['@type'] === 'chatMemberStatusAdministrator' &&
            group.status.rights?.can_restrict_members === true);
      }
    } else {
      throw new Error('This chat is not a group or channel.');
    }

    const photo = chat.photo?.small;
    const avatarUri = photo
      ? await localFile(this.host.api(), photo, 16).catch(() => undefined)
      : undefined;

    return {
      description: description || undefined,
      link,
      memberCount,
      avatarUri,
      ...(slowModeDelay === undefined ? {} : { slowModeDelay, canSetSlowMode }),
    };
  }

  async setSlowModeDelay(id: ProtocolChatId, seconds: number): Promise<void> {
    if (![0, 5, 10, 30, 60, 300, 900, 3600].includes(seconds))
      throw new Error('Unsupported slow mode delay.');
    await this.host.api().send({
      '@type': 'setChatSlowModeDelay',
      chat_id: Number(id),
      slow_mode_delay: seconds,
    });
  }

  async addMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void> {
    await this.host.api().send({
      '@type': 'addChatMembers',
      chat_id: Number(id),
      user_ids: participants.map(Number),
    });
    this.host.td.members.delete(Number(id));
  }

  async removeMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void> {
    for (const participant of participants) {
      await this.host.api().send({
        '@type': 'setChatMemberStatus',
        chat_id: Number(id),
        member_id: userSender(participant),
        status: { '@type': 'chatMemberStatusLeft' },
      });
    }
    this.host.td.members.delete(Number(id));
  }

  async banMember(id: ProtocolChatId, participant: ParticipantId): Promise<void> {
    await this.host.api().send({
      '@type': 'banChatMember',
      chat_id: Number(id),
      member_id: userSender(participant),
      banned_until_date: 0,
      revoke_messages: false,
    });
    this.host.td.members.delete(Number(id));
  }

  async setMemberMuted(
    id: ProtocolChatId,
    participant: ParticipantId,
    muted: boolean
  ): Promise<void> {
    await this.host.api().send({
      '@type': 'setChatMemberStatus',
      chat_id: Number(id),
      member_id: userSender(participant),
      status: muted
        ? {
            '@type': 'chatMemberStatusRestricted',
            is_member: true,
            restricted_until_date: 0,
            permissions: NO_PERMISSIONS,
          }
        : { '@type': 'chatMemberStatusMember', member_until_date: 0 },
    });
    this.host.td.members.delete(Number(id));
  }

  async renameGroup(id: ProtocolChatId, title: string): Promise<void> {
    await this.host.api().send({ '@type': 'setChatTitle', chat_id: Number(id), title });
  }

  async leaveGroup(id: ProtocolChatId): Promise<void> {
    await this.host.api().send({ '@type': 'leaveChat', chat_id: Number(id) });
  }
}

import type { JoinRequest, PublicChatPreview } from '@/core/messaging/protocol';
import type { ProtocolChatId, ParticipantId, ProtocolChat } from '@/core/messaging/types';

import type { TdObject } from './api';
import { inMainList, isCurrentMember } from './chats';
import { localUriOf } from './files';
import { chatIdOf } from './ids';
import type { TelegramGroups } from './groups';
import { isInviteLink, joinOrRequest, normalizeInviteLink } from './invite-links';
import type { TdChat, TdFile, TdSupergroup } from './types';
import type { TelegramHost } from './service-host';
import { nameOf } from './users';

interface TdJoinRequest {
  user_id: number;
  date: number;
  bio: string;
}

interface TdJoinRequests extends TdObject {
  total_count: number;
  requests: TdJoinRequest[];
}

export class TelegramJoining {
  constructor(
    private readonly host: TelegramHost,
    private readonly groups: TelegramGroups
  ) {}

  async previewPublicChat(usernameOrLink: string): Promise<PublicChatPreview> {
    if (isInviteLink(usernameOrLink)) return this.previewInviteLink(usernameOrLink);
    const value = usernameOrLink.trim();
    const username = value
      .replace(/^(?:https?:\/\/)?t\.me\//i, '')
      .replace(/^@/, '')
      .replace(/\/$/, '');
    if (!/^[A-Za-z0-9_]{4,32}$/.test(username))
      throw new Error('Enter a Telegram @username or public t.me link.');
    const chat = await this.host.api().send<TdChat>({ '@type': 'searchPublicChat', username });
    if (chat.type['@type'] !== 'chatTypeSupergroup')
      throw new Error('That username belongs to a person, not a group or channel.');
    this.host.td.chats.set(chat.id, chat);
    const info = await this.groups.getGroupInfo(chatIdOf(chat.id)).catch(() => ({}));
    const group = this.host.td.supergroups.get(chat.type.supergroup_id);
    return {
      id: String(chat.id),
      title: chat.title,
      kind: chat.type.is_channel ? 'channel' : 'group',
      joined: group ? isCurrentMember(group.status['@type']) : inMainList(chat),
      requiresApproval: group?.join_by_request,
      ...info,
    };
  }

  async joinPublicChat(reference: string): Promise<ProtocolChat | null> {
    if (isInviteLink(reference)) return this.joinInviteLink(reference);
    const chatId = Number(reference);
    const current = await this.host.td.requireChat(chatId);
    if (current.type['@type'] !== 'chatTypeSupergroup')
      throw new Error('That chat is not a public group or channel.');
    const group =
      this.host.td.supergroups.get(current.type.supergroup_id) ??
      (await this.host.api().send<TdSupergroup>({
        '@type': 'getSupergroup',
        supergroup_id: current.type.supergroup_id,
      }));
    if (
      !isCurrentMember(group.status['@type']) &&
      (await joinOrRequest(this.host.api().send({ '@type': 'joinChat', chat_id: chatId }))) === null
    )
      return null;
    const chat = await this.host.api().send<TdChat>({ '@type': 'getChat', chat_id: chatId });
    this.host.td.chats.set(chatId, chat);
    return this.host.toChat(chat);
  }

  private async previewInviteLink(link: string): Promise<PublicChatPreview> {
    const inviteLink = normalizeInviteLink(link);
    const info = await this.host.api().send<{
      '@type': string;
      title: string;
      description?: string;
      member_count?: number;
      creates_join_request: boolean;
      type: { '@type': string };
      photo?: { small: TdFile } | null;
    }>({ '@type': 'checkChatInviteLink', invite_link: inviteLink });
    const photo = info.photo?.small;
    return {
      id: inviteLink,
      joined: false,
      title: info.title,
      kind: info.type['@type'] === 'inviteLinkChatTypeChannel' ? 'channel' : 'group',
      description: info.description || undefined,
      memberCount: info.member_count || undefined,
      requiresApproval: info.creates_join_request,
      avatarUri: photo && localUriOf(photo),
    };
  }

  private async joinInviteLink(link: string): Promise<ProtocolChat | null> {
    const chat = await joinOrRequest(
      this.host.api().send<TdChat>({
        '@type': 'joinChatByInviteLink',
        invite_link: normalizeInviteLink(link),
      })
    );
    if (!chat) return null;
    this.host.td.chats.set(chat.id, chat);
    return this.host.toChat(chat);
  }

  async createInviteLink(id: ProtocolChatId, requiresApproval: boolean): Promise<string> {
    const link = await this.host.api().send<{ '@type': string; invite_link: string }>({
      '@type': 'createChatInviteLink',
      chat_id: Number(id),
      name: '',
      expiration_date: 0,
      member_limit: 0,
      creates_join_request: requiresApproval,
    });
    return link.invite_link;
  }

  async getJoinRequests(id: ProtocolChatId): Promise<JoinRequest[]> {
    const chatId = Number(id);
    const requests: TdJoinRequest[] = [];
    let offset: TdJoinRequest | null = null;
    while (true) {
      const page = await this.host.api().send<TdJoinRequests>({
        '@type': 'getChatJoinRequests',
        chat_id: chatId,
        invite_link: '',
        query: '',
        offset_request: offset,
        limit: 100,
      });
      if (page.requests.length === 0) break;
      const last: TdJoinRequest = page.requests[page.requests.length - 1];
      if (offset && last.user_id === offset.user_id && last.date === offset.date) break;
      requests.push(...page.requests);
      offset = last;
      if (requests.length >= page.total_count) break;
    }
    return Promise.all(
      requests.map(async (request) => {
        const user = await this.host.td.userFor(String(request.user_id));
        return {
          participantId: String(request.user_id),
          name: user ? nameOf(user) : String(request.user_id),
          bio: request.bio || undefined,
          requestedAt: request.date * 1000,
        };
      })
    );
  }

  async processJoinRequest(
    id: ProtocolChatId,
    participantId: ParticipantId,
    approve: boolean
  ): Promise<void> {
    await this.host.api().send({
      '@type': 'processChatJoinRequest',
      chat_id: Number(id),
      user_id: Number(participantId),
      approve,
    });
    this.host.td.members.delete(Number(id));
  }
}

import type {
  ChatSession,
  GroupInfo,
  JoinRequest,
  LoginState,
  MentionCandidate,
  PublicChatPreview,
} from '@/core/messaging/protocol';
import type {
  ProtocolChatId,
  GroupMember,
  MessageContent,
  MessageId,
  ParticipantId,
  SelfParticipant,
  Unsubscribe,
  ConsentDecision,
  ProtocolMessage,
  ProtocolChat,
} from '@/core/messaging/types';
import { UnsupportedError } from '@/core/errors';
import { localFileUri } from '@/storage/media';

import type {
  MatrixApi,
  MxEvent,
  MxMedia,
  MxMember,
  MxPreview,
  MxReceipt,
  MxRoom,
  MxSession,
  MxStartParams,
  MxUpdate,
} from './api';
import type { BridgedNetwork } from '@/core/messaging/networks';
import { bridgedNetwork, isBridgeBot } from './bridges';
import { toContent } from './content';
import { outgoing, textOutgoing } from './outgoing';
import {
  chatIdOf,
  localpart,
  parseRoomReference,
  parseUserId,
  permalink,
  roomIdOf,
  USER_ID,
} from './ids';
import { Homeserver } from './homeserver';
import { PresenceWatcher } from './presence';
import { RoomFeatureStore } from './room-features';
import { searchHomeserver } from './search';
import { inviteLink, knocks } from './join-requests';
import { BridgeProvisioning, type MatrixCapabilities } from './provisioning';

const UNFETCHED_LIMIT = 2_000;

interface MatrixConnectOptions {
  createApi(): Promise<MatrixApi>;
  parameters: MxStartParams;
  /** Called with the session after sign-in and with null after sign-out. */
  persistSession(session: MxSession | null): Promise<void>;
}

/**
 * A Matrix client over matrix-rust-sdk, which owns history, keys and media
 * in its own store. Joined rooms and invitations are surfaced; spaces are
 * not chats.
 */
export class MatrixSession implements ChatSession, MatrixCapabilities {
  readonly sendsImages = true;
  readonly sendsVideo = true;
  readonly sendsStickers = true;
  readonly threads = true;
  private api!: MatrixApi;
  private unsubscribe: Unsubscribe | null = null;
  private userId: string | null = null;
  private login: LoginState | null = null;
  private readonly loginListeners = new Set<(login: LoginState | null) => void>();
  private readonly messageListeners = new Set<(message: ProtocolMessage) => void>();
  private readonly chatListeners = new Set<(chat: ProtocolChat) => void>();
  private readonly rooms = new Map<string, MxRoom>();
  private readonly typing = new Map<string, boolean>();
  /** When the newest event someone else has read in each room was sent. */
  private readonly readMarks = new Map<string, number>();
  private readonly pollAnswers = new Map<string, string[]>();
  private readonly members = new Map<string, MxMember[]>();
  private readonly pendingMembers = new Map<string, Promise<MxMember[]>>();
  private readonly names = new Map<string, string>();
  /**
   * A room keeps the bridge it once showed, even after the bridged users fall out of the
   * summary. null means none showed yet; the room is looked at again once its roster arrives.
   */
  /** Only networks found: a room seen before its bridge shows is looked at again. */
  private readonly networks = new Map<string, BridgedNetwork>();
  private readonly mediaPaths = new Map<string, string>();
  private readonly awaitedMedia = new Map<string, MxEvent[]>();
  private readonly unfetched = new Map<MessageId, { raw: MxEvent; media: MxMedia }>();
  private readonly avatars = new Map<string, string | null>();
  private ignored: ReadonlySet<string> = new Set();
  private readonly presence = new PresenceWatcher(
    () => this.homeserver(),
    (userId) => this.announceDmsWith(userId)
  );
  private readonly features = new RoomFeatureStore(
    () => this.homeserver(),
    (roomId) => this.announceRoom(roomId)
  );

  private constructor(private readonly options: MatrixConnectOptions) {}

  static async connect(options: MatrixConnectOptions): Promise<MatrixSession> {
    const session = new MatrixSession(options);
    await session.start();
    return session;
  }

  get self(): SelfParticipant {
    return this.userId
      ? { participantId: this.userId, address: this.userId }
      : { participantId: '', address: '' };
  }

  private async start(): Promise<void> {
    this.api = await this.options.createApi();
    this.unsubscribe = this.api.onUpdate((update) => {
      this.handleUpdate(update).catch(() => {});
    });
    const session = await this.api.start(this.options.parameters);
    if (session) await this.onReady(session);
    else this.askForPassword();
  }

  /** A session that ended, however it ended, leaves nothing worth keeping. */
  private async restart(error?: string): Promise<void> {
    this.userId = null;
    this.options.parameters.session = null;
    await this.options.persistSession(null);
    this.rooms.clear();
    this.typing.clear();
    this.readMarks.clear();
    this.pollAnswers.clear();
    this.members.clear();
    this.pendingMembers.clear();
    this.awaitedMedia.clear();
    this.avatars.clear();
    this.presence.clear();
    this.features.clear();
    this.unsubscribe?.();
    await this.api.close();
    await this.start();
    if (error && this.login) this.setLogin({ ...this.login, error });
  }

  subscribeLogin(listener: (login: LoginState | null) => void): Unsubscribe {
    this.loginListeners.add(listener);
    listener(this.login);
    return () => this.loginListeners.delete(listener);
  }

  async submitLogin(value: string): Promise<void> {
    const current = this.login;
    if (!current) throw new Error('Matrix is not asking for anything right now.');
    this.setLogin({ ...current, error: undefined });
    try {
      const session = await this.api.login(value);
      await this.onReady(session);
    } catch (error) {
      const message = describeLoginError(error);
      this.setLogin({ ...current, error: message });
      throw new Error(message);
    }
  }

  bridgeProvisioning(bridge: string): BridgeProvisioning | null {
    const homeserver = this.homeserver()?.at(`/_matrix/provision/${encodeURIComponent(bridge)}`);
    if (!homeserver || !this.userId) return null;
    const query = `user_id=${encodeURIComponent(this.userId)}`;
    return new BridgeProvisioning((path, init = {}) =>
      homeserver.request(
        init.method ?? 'GET',
        `${path}${path.includes('?') ? '&' : '?'}${query}`,
        init.body
      )
    );
  }

  async signOut(): Promise<void> {
    await this.api.logout();
    await this.restart();
  }

  private askForPassword(): void {
    const { userId, homeserverUrl } = this.options.parameters;
    this.setLogin({
      step: 'password',
      hint: `The password for ${userId} on ${new URL(homeserverUrl).host}.`,
    });
  }

  private setLogin(login: LoginState | null): void {
    this.login = login;
    for (const listener of this.loginListeners) listener(login);
  }

  private async onReady(session: MxSession): Promise<void> {
    this.userId = session.userId;
    this.options.parameters.session = session;
    await this.options.persistSession(session);
    this.setLogin(null);
    void this.loadIgnored().catch(() => {});
  }

  private async loadIgnored(): Promise<void> {
    this.followIgnored(new Set(await this.api.ignoredUsers()));
  }

  private followIgnored(ignored: ReadonlySet<string>): void {
    const before = this.ignored;
    this.ignored = ignored;
    for (const room of this.rooms.values()) {
      const participant = this.participantOf(room);
      if (included(room) && participant && before.has(participant) !== ignored.has(participant))
        this.announce(room);
    }
  }

  private async handleUpdate(update: MxUpdate): Promise<void> {
    switch (update.type) {
      case 'room':
        return this.onRoom(update.room);
      case 'roomGone':
        this.rooms.delete(update.roomId);
        this.typing.delete(update.roomId);
        this.readMarks.delete(update.roomId);
        this.forgetMembers(update.roomId);
        return;
      case 'typing': {
        const active = update.userIds.some((id) => id !== this.userId);
        this.typing.set(update.roomId, active);
        this.announceRoom(update.roomId);
        return;
      }
      case 'receipts':
        return this.onReceipts(update.roomId, update.receipts);
      case 'event':
        return this.emitMessage(update.event);
      case 'signedOut':
        return this.restart('The homeserver ended this session. Sign in again.');
    }
  }

  private onRoom(room: MxRoom): void {
    this.rooms.set(room.id, room);
    if (room.isDm) this.forgetMembers(room.id);
    if (room.isDm && room.heroes.length === 1 && room.name)
      this.names.set(room.heroes[0], room.name);
    if (included(room)) this.announce(room);
  }

  /** Bots acknowledge delivery with a receipt; only people reading count. */
  private onReceipts(roomId: string, receipts: MxReceipt[]): void {
    const at = Math.max(
      0,
      ...receipts.filter(({ userId }) => this.isSomeoneElse(userId)).map(({ at }) => at)
    );
    if (at <= (this.readMarks.get(roomId) ?? 0)) return;
    this.readMarks.set(roomId, at);
    this.announceRoom(roomId);
  }

  private announceRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room && included(room)) this.announce(room);
  }

  private announceDmsWith(userId: string): void {
    for (const room of this.rooms.values())
      if (room.isDm && included(room) && this.participantOf(room) === userId) this.announce(room);
  }

  private homeserver(): Homeserver | null {
    const { session, homeserverUrl } = this.options.parameters;
    return session ? new Homeserver(homeserverUrl, session.accessToken) : null;
  }

  private requireHomeserver(): Homeserver {
    const homeserver = this.homeserver();
    if (!homeserver) throw new Error('Sign in to Matrix first.');
    return homeserver;
  }

  private announce(room: MxRoom): void {
    if (this.chatListeners.size === 0) return;
    const chat = this.toChat(room);
    for (const listener of this.chatListeners) listener(chat);
  }

  private async emitMessage(raw: MxEvent): Promise<void> {
    if (this.messageListeners.size === 0) return;
    const room = this.rooms.get(raw.roomId);
    if (room && !included(room)) return;
    const message = this.toMessage(raw, false);
    for (const listener of this.messageListeners) listener(message);
  }

  async listChats(): Promise<ProtocolChat[]> {
    if (!this.userId) return [];
    return [...this.rooms.values()].filter(included).map((room) => this.toChat(room));
  }

  async getMessages(
    id: ProtocolChatId,
    opts?: { limit?: number; before?: { sentAt: number; id: MessageId } }
  ): Promise<ProtocolMessage[]> {
    if (!this.userId) return [];
    const roomId = roomIdOf(id);
    const events = await this.api.messages(roomId, {
      limit: opts?.limit ?? 50,
      before: opts?.before?.id,
    });
    const room = this.rooms.get(roomId);
    if (room && !room.isDm) void this.membersOf(roomId);
    return events.map((event) => this.toMessage(event, false));
  }

  async fetchMedia(_id: ProtocolChatId, messageId: MessageId): Promise<void> {
    const unfetched = this.unfetched.get(messageId);
    if (!unfetched) return;
    this.unfetched.delete(messageId);
    this.download(unfetched.raw, unfetched.media);
  }

  async resolveParticipant(addressOrId: string): Promise<ParticipantId | null> {
    const userId = parseUserId(addressOrId);
    if (!userId || userId === this.userId) return null;
    const profile = await this.api.profile(userId).catch(() => null);
    if (!profile) return null;
    if (profile.displayName) this.names.set(userId, profile.displayName);
    return userId;
  }

  async resolveAddresses(ids: ParticipantId[]): Promise<Record<ParticipantId, string>> {
    return Object.fromEntries(ids.filter((id) => USER_ID.test(id)).map((id) => [id, id]));
  }

  async resolveNames(ids: ParticipantId[]): Promise<Record<ParticipantId, string>> {
    const unknown = [...new Set(ids)].filter((id) => !this.names.has(id) && USER_ID.test(id));
    await Promise.all(
      unknown.map(async (id) => {
        const profile = await this.api.profile(id).catch(() => null);
        if (profile?.displayName) this.names.set(id, profile.displayName);
      })
    );
    const out: Record<ParticipantId, string> = {};
    for (const id of ids) {
      const name = this.names.get(id);
      if (name) out[id] = name;
    }
    return out;
  }

  async createDm(participant: ParticipantId): Promise<ProtocolChat> {
    const existing = [...this.rooms.values()].find(
      (room) =>
        room.isDm && room.membership === 'joined' && this.participantOf(room) === participant
    );
    return this.toChat(existing ?? (await this.requireRoom(await this.api.createDm(participant))));
  }

  async createGroup(participants: ParticipantId[], title: string): Promise<ProtocolChat> {
    return this.toChat(await this.requireRoom(await this.api.createRoom(participants, title)));
  }

  async previewPublicChat(input: string): Promise<PublicChatPreview> {
    const reference = parseRoomReference(input);
    if (!reference) throw new Error('Enter a Matrix room alias, ID, or matrix.to link.');
    const room = await this.api.previewPublicRoom(reference.idOrAlias, reference.via);
    const joinedRoom = room.joined ? await this.api.room(room.id) : null;
    return {
      id: input.trim(),
      title: room.name,
      kind: joinedRoom?.broadcast ? 'channel' : 'group',
      joined: room.joined,
      requiresApproval: room.canRequestJoin && !room.joined,
      description: room.topic,
      avatarUri: await this.roomAvatar(room.avatarUrl),
      memberCount: room.memberCount,
      link: permalink(reference.idOrAlias),
      joinUnavailableReason:
        !room.canJoin && !room.canRequestJoin && !room.joined
          ? 'This chat requires an invitation.'
          : undefined,
    };
  }

  async joinPublicChat(input: string): Promise<ProtocolChat | null> {
    const reference = parseRoomReference(input);
    if (!reference) throw new Error('That Matrix link is invalid.');
    const room = await this.api.previewPublicRoom(reference.idOrAlias, reference.via);
    if (!room.joined && room.canRequestJoin) {
      await this.api.knockPublicRoom(reference.idOrAlias, reference.via);
      return null;
    }
    if (!room.joined && !room.canJoin) throw new Error('This chat requires an invitation.');
    const roomId = room.joined
      ? room.id
      : await this.api.joinPublicRoom(reference.idOrAlias, reference.via);
    return this.toChat(await this.requireRoom(roomId));
  }

  async getMembers(id: ProtocolChatId): Promise<GroupMember[]> {
    const roomId = roomIdOf(id);
    const sendLevel = this.rooms.get(roomId)?.sendLevel;
    const members = await this.membersOf(roomId);
    return members.map((member) => ({
      id: member.userId,
      role: member.role,
      ...(member.powerLevel !== undefined &&
      sendLevel !== undefined &&
      member.powerLevel < sendLevel
        ? { muted: true }
        : {}),
    }));
  }

  async banMember(id: ProtocolChatId, participant: ParticipantId): Promise<void> {
    await this.api.ban(roomIdOf(id), participant);
    this.forgetMembers(roomIdOf(id));
  }

  async setMemberMuted(
    id: ProtocolChatId,
    participant: ParticipantId,
    muted: boolean
  ): Promise<void> {
    const room = await this.requireRoom(roomIdOf(id));
    await this.api.setPowerLevel(
      room.id,
      participant,
      muted ? (room.sendLevel ?? 0) - 1 : (room.defaultLevel ?? 0)
    );
    this.forgetMembers(room.id);
  }

  async getGroupInfo(id: ProtocolChatId): Promise<GroupInfo> {
    const room = await this.requireRoom(roomIdOf(id));
    return {
      description: room.topic,
      avatarUri: await this.roomAvatar(room.avatarUrl),
      memberCount: room.memberCount,
      link: permalink(room.canonicalAlias ?? room.id),
    };
  }

  private avatarOf(room: MxRoom): string | undefined {
    const url = room.avatarUrl;
    if (!url) return undefined;
    const known = this.avatars.get(url);
    if (known !== undefined) return known ?? undefined;
    this.avatars.set(url, null);
    void this.roomAvatar(url).then((uri) => {
      if (!uri) return;
      this.avatars.set(url, uri);
      const current = this.rooms.get(room.id);
      if (current?.avatarUrl === url && included(current)) this.announce(current);
    });
    return undefined;
  }

  private async roomAvatar(url?: string): Promise<string | undefined> {
    if (!url) return undefined;
    return this.api
      .media({ source: JSON.stringify({ url }), name: 'avatar' })
      .then(localFileUri)
      .catch(() => undefined);
  }

  async mentionCandidates(id: ProtocolChatId, query: string): Promise<MentionCandidate[]> {
    const needle = query.toLowerCase();
    const members = await this.membersOf(roomIdOf(id));
    return (
      members
        .filter((member) => member.userId !== this.userId)
        // No address: a bridged user's Matrix id means nothing on Slack or Discord, a pill does.
        .map((member) => ({
          id: member.userId,
          name: member.displayName || localpart(member.userId),
        }))
        .filter(
          (member) =>
            member.name.toLowerCase().includes(needle) || member.id.toLowerCase().includes(needle)
        )
        .slice(0, 20)
    );
  }

  async addMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void> {
    const roomId = roomIdOf(id);
    await Promise.all(participants.map((participant) => this.api.invite(roomId, participant)));
    this.forgetMembers(roomId);
  }

  async removeMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void> {
    const roomId = roomIdOf(id);
    await Promise.all(participants.map((participant) => this.api.kick(roomId, participant)));
    this.forgetMembers(roomId);
  }

  async renameGroup(id: ProtocolChatId, title: string): Promise<void> {
    await this.api.setName(roomIdOf(id), title);
  }

  async leaveGroup(id: ProtocolChatId): Promise<void> {
    await this.api.leave(roomIdOf(id));
  }

  /** The real id arrives with the echo; until then the store keeps its own pending entry. */
  async send(
    id: ProtocolChatId,
    content: MessageContent,
    replyTo?: MessageId,
    threadRoot?: MessageId
  ): Promise<MessageId> {
    const roomId = roomIdOf(id);
    if (content.kind === 'reaction') {
      await this.api.toggleReaction(roomId, content.targetId, content.emoji);
      return `${content.targetId}_reaction`;
    }
    const eventId = await this.api.send(roomId, outgoing(content), replyTo, threadRoot);
    return eventId ?? `local:${Date.now()}`;
  }

  async deleteMessage(id: ProtocolChatId, messageId: MessageId): Promise<void> {
    await this.api.redact(roomIdOf(id), messageId);
  }

  async listPinnedMessages(id: ProtocolChatId): Promise<ProtocolMessage[]> {
    const events = await this.api.pinnedMessages(roomIdOf(id));
    return events.map((event) => ({ ...this.toMessage(event, true), isPinned: true }));
  }

  async setMessagePinned(id: ProtocolChatId, messageId: MessageId, pinned: boolean): Promise<void> {
    await this.api.setPinned(roomIdOf(id), messageId, pinned);
  }

  async editMessage(id: ProtocolChatId, messageId: MessageId, text: string): Promise<void> {
    await this.api.edit(roomIdOf(id), messageId, textOutgoing(text));
  }

  /** The homeserver holds back an ignored user's events, in every room. */
  async setBlocked(id: ProtocolChatId, blocked: boolean): Promise<void> {
    const room = await this.requireRoom(roomIdOf(id));
    const chat = this.toChat(room);
    const participant = this.participantOf(room);
    if (chat.kind !== 'dm' || !participant) {
      throw new UnsupportedError('On Matrix only a DM with someone known can be blocked.');
    }
    await this.api.setIgnored(participant, blocked);
    const ignored = new Set(this.ignored);
    if (blocked) ignored.add(participant);
    else ignored.delete(participant);
    this.followIgnored(ignored);
  }

  async setConsent(id: ProtocolChatId, consent: ConsentDecision): Promise<void> {
    const roomId = roomIdOf(id);
    const room = await this.requireRoom(roomId);
    if (room.membership !== 'invited') throw new Error('This chat is not a request.');
    if (consent === 'accepted') await this.api.join(roomId);
    else await this.api.leave(roomId);
  }

  async sendReadReceipt(id: ProtocolChatId): Promise<void> {
    await this.api.markRead(roomIdOf(id));
  }

  async getJoinRequests(id: ProtocolChatId): Promise<JoinRequest[]> {
    return knocks(this.requireHomeserver(), roomIdOf(id));
  }

  async processJoinRequest(
    id: ProtocolChatId,
    participantId: ParticipantId,
    approve: boolean
  ): Promise<void> {
    if (approve) await this.api.invite(roomIdOf(id), participantId);
    else await this.api.kick(roomIdOf(id), participantId);
  }

  async createInviteLink(id: ProtocolChatId, requiresApproval: boolean): Promise<string> {
    const room = await this.requireRoom(roomIdOf(id));
    return inviteLink(this.requireHomeserver(), room, this.self.participantId, requiresApproval);
  }

  async searchMessages(query: string, id?: ProtocolChatId): Promise<ProtocolMessage[]> {
    const homeserver = this.homeserver();
    if (!homeserver || !this.userId) return [];
    const events = await searchHomeserver(homeserver, query, this.userId, id && roomIdOf(id));
    return events
      .filter((event) => {
        const room = this.rooms.get(event.roomId);
        return room !== undefined && included(room);
      })
      .map((event) => this.toMessage(event, false));
  }

  async setMarkedUnread(id: ProtocolChatId, unread: boolean): Promise<void> {
    await this.api.setMarkedUnread(roomIdOf(id), unread);
  }

  watchPresence(id: ProtocolChatId): Unsubscribe {
    const room = this.rooms.get(roomIdOf(id));
    const participant = room?.isDm ? this.participantOf(room) : null;
    return participant ? this.presence.watch(participant) : () => {};
  }

  async setTyping(id: ProtocolChatId, typing: boolean): Promise<void> {
    await this.api.setTyping(roomIdOf(id), typing);
  }

  async createPoll(id: ProtocolChatId, question: string, options: string[]): Promise<void> {
    await this.api.createPoll(roomIdOf(id), question, options);
  }

  async votePoll(id: ProtocolChatId, messageId: MessageId, optionIds: number[]): Promise<void> {
    const answers = this.pollAnswers.get(messageId);
    if (!answers) throw new Error('Load this poll before voting.');
    const selected = optionIds.map((index) => answers[index]);
    if (selected.some((answer) => !answer)) throw new Error('That poll choice is unavailable.');
    await this.api.votePoll(roomIdOf(id), messageId, selected);
  }

  /** The SDK syncs rooms continuously; only who is ignored needs asking again. */
  async sync(): Promise<void> {
    if (this.userId) await this.loadIgnored();
  }

  async streamMessages(onMessage: (m: ProtocolMessage) => void): Promise<Unsubscribe> {
    this.messageListeners.add(onMessage);
    return () => this.messageListeners.delete(onMessage);
  }

  async streamChats(onChat: (c: ProtocolChat) => void): Promise<Unsubscribe> {
    this.chatListeners.add(onChat);
    for (const room of this.rooms.values()) {
      if (included(room)) onChat(this.toChat(room));
    }
    return () => this.chatListeners.delete(onChat);
  }

  async disconnect(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.api.close();
  }

  async eraseLocalDatabase(): Promise<void> {
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.api.erase();
  }

  private async requireRoom(roomId: string): Promise<MxRoom> {
    const room = this.rooms.get(roomId) ?? (await this.api.room(roomId));
    if (!room) throw new Error('The chat did not appear.');
    this.rooms.set(room.id, room);
    return room;
  }

  /** Fetched once per room; a DM's other participant is known without it. */
  private membersOf(roomId: string): Promise<MxMember[]> {
    const known = this.members.get(roomId);
    if (known) return Promise.resolve(known);
    let pending = this.pendingMembers.get(roomId);
    if (!pending) {
      pending = this.api
        .members(roomId)
        .then((members) => {
          for (const member of members) {
            if (member.displayName) this.names.set(member.userId, member.displayName);
          }
          this.members.set(roomId, members);
          const room = this.rooms.get(roomId);
          if (room && members.length > 0) this.announce(room);
          return members;
        })
        .finally(() => this.pendingMembers.delete(roomId));
      this.pendingMembers.set(roomId, pending);
    }
    return pending;
  }

  private forgetMembers(roomId: string): void {
    this.members.delete(roomId);
    this.pendingMembers.delete(roomId);
  }

  private rosterOf(roomId: string): string[] | undefined {
    return this.members.get(roomId)?.map((member) => member.userId);
  }

  private isSomeoneElse(userId: string): boolean {
    return userId !== this.self.participantId && !isBridgeBot(userId);
  }

  private participantOf(room: MxRoom, roster = this.rosterOf(room.id) ?? []): string | null {
    const selfId = this.self.participantId;
    return (
      room.peer ??
      room.heroes.find((id) => this.isSomeoneElse(id)) ??
      roster.find((id) => this.isSomeoneElse(id)) ??
      (room.inviter !== selfId ? room.inviter : null) ??
      null
    );
  }

  private toChat(room: MxRoom): ProtocolChat {
    const selfId = this.self.participantId;
    const roster = this.rosterOf(room.id);
    const network = this.networkOf(room, roster);
    const lacks = network ? this.features.lacks(room.id) : undefined;
    const humans = network && !room.isDm ? humansIn(room, roster) : undefined;
    // A bot at default power, such as mautrix-discord's or Slackbot, shows only in the roster.
    if (humans === 3 && !roster && room.membership === 'joined') void this.membersOf(room.id);
    const isDm = room.isDm || (humans === 2 && !room.name.startsWith('#'));
    const participant = this.participantOf(room, roster ?? []);
    const memberIds = isDm
      ? participant
        ? [participant, selfId]
        : [selfId]
      : [...new Set([...(roster ?? room.heroes), selfId])];

    return {
      id: chatIdOf(room.id),
      kind: isDm ? 'dm' : room.broadcast ? 'channel' : 'group',
      canSend: room.canSend,
      typing: this.typing.get(room.id) ?? false,
      ...(isDm && participant ? this.peerState(participant) : {}),
      network,
      title: room.name || (isDm ? (participant ?? room.id) : 'Untitled chat'),
      avatarUri: this.avatarOf(room),
      memberIds,
      createdAt: room.latest?.timestamp ?? 0,
      lastMessage: room.latest
        ? { ...this.toMessage(previewEvent(room), false), preview: true }
        : undefined,
      unreadCount: room.unreadCount,
      mentionCount: room.mentionCount,
      ...(room.markedUnread ? { markedUnread: true } : {}),
      readUpTo: this.readMarks.get(room.id),
      canPin: room.canPin,
      canDeleteOthers: room.canDeleteOthers,
      ...(lacks?.length ? { lacks } : {}),
      consent: room.membership === 'invited' ? 'request' : 'accepted',
      selfRole: isDm ? undefined : room.selfRole,
    };
  }

  private networkOf(room: MxRoom, roster: string[] | undefined): BridgedNetwork | undefined {
    const known = this.networks.get(room.id);
    if (known) return known;
    const network = bridgedNetwork([
      room.peer,
      room.latest?.sender,
      room.inviter,
      ...room.heroes,
      ...room.elevated,
      ...(roster ?? []),
    ]);
    if (network) this.networks.set(room.id, network);
    return network;
  }

  private peerState(participant: string): Partial<ProtocolChat> {
    const presence = this.presence.get(participant);
    return {
      ...(presence?.online ? { online: true } : {}),
      ...(presence?.lastSeenAt ? { lastSeenAt: presence.lastSeenAt } : {}),
      ...(this.ignored.has(participant) ? { blocked: true } : {}),
    };
  }

  private toMessage(raw: MxEvent, fetchMedia: boolean): ProtocolMessage {
    if (raw.senderName) this.names.set(raw.sender, raw.senderName);
    const reactions = raw.reactions?.filter((r) => r.senders.length > 0) ?? [];
    return {
      id: raw.id,
      chatId: chatIdOf(raw.roomId),
      senderId: raw.sender,
      sentAt: raw.timestamp,
      content: toContent(raw, {
        selfId: this.userId ?? undefined,
        media: (media) => this.mediaUri(raw, media, fetchMedia),
        nameOf: (userId) => this.nameOf(userId),
        learnName: (userId, name) => this.names.set(userId, name),
        learnPoll: (eventId, answerIds) => this.pollAnswers.set(eventId, answerIds),
      }),
      fromMe: raw.isOwn,
      status: raw.status,
      replyTo: raw.replyTo,
      threadRoot: raw.threadRoot,
      ...(raw.edited ? { edited: true } : {}),
      reactions:
        reactions.length > 0
          ? Object.fromEntries(reactions.map((r) => [r.key, r.senders]))
          : undefined,
    };
  }

  private mediaUri(raw: MxEvent, media: MxMedia, fetchMedia: boolean): string | null {
    const path = this.mediaPaths.get(media.source);
    if (path) return localFileUri(path);
    if (fetchMedia) {
      this.download(raw, media);
    } else {
      if (this.unfetched.size >= UNFETCHED_LIMIT)
        this.unfetched.delete(this.unfetched.keys().next().value!);
      this.unfetched.set(raw.id, { raw, media });
    }
    return null;
  }

  private download(raw: MxEvent, media: MxMedia): void {
    const waiting = this.awaitedMedia.get(media.source);
    if (waiting) {
      if (!waiting.some((event) => event.id === raw.id)) waiting.push(raw);
      return;
    }
    this.awaitedMedia.set(media.source, [raw]);
    this.api
      .media(media)
      .then(async (downloaded) => {
        this.mediaPaths.set(media.source, downloaded);
        const events = this.awaitedMedia.get(media.source) ?? [];
        this.awaitedMedia.delete(media.source);
        await Promise.all(events.map((event) => this.emitMessage(event)));
      })
      .catch(() => this.awaitedMedia.delete(media.source));
  }

  private nameOf(userId: string): string {
    return this.names.get(userId) ?? localpart(userId);
  }
}

function included(room: MxRoom): boolean {
  return room.membership === 'joined' || room.membership === 'invited';
}

/** The preview has no id, so it gets one nothing else will match. */
function previewEvent(room: MxRoom): MxEvent {
  const latest = room.latest as MxPreview;
  return {
    ...latest,
    id: `preview:${room.id}:${latest.timestamp}`,
    roomId: room.id,
    status: 'sent',
  };
}

function describeLoginError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/M_FORBIDDEN|Invalid username\/password|invalid password/i.test(message))
    return 'Wrong password.';
  if (/M_USER_DEACTIVATED/.test(message)) return 'That account has been deactivated.';
  if (/M_LIMIT_EXCEEDED/.test(message))
    return 'Too many attempts. Wait a moment before trying again.';
  if (/M_UNKNOWN_TOKEN/.test(message)) return 'The homeserver rejected the session. Sign in again.';
  if (/dns error|connection refused|failed to lookup|ENOTFOUND/i.test(message)) {
    return 'The homeserver could not be reached. Check the URL.';
  }
  return message;
}

/**
 * A bridge that doesn't mark its one-to-one portals as direct still leaves
 * just you, the other person and its bots in them. Slack channels keep their `#`.
 */
function humansIn(room: MxRoom, roster: readonly string[] = []): number {
  const bots = new Set([...room.elevated, ...room.heroes, ...roster].filter(isBridgeBot));
  return (room.memberCount ?? 0) - bots.size;
}

import { UnsupportedError } from '../errors';
import { HistoryTracker, type HistoryState } from './history';
import { HYDRATE_LIMIT, type MessageStore, type TransportChat } from './message-store';
import { showsInPreview } from './message-rules';
import type { ChatSession } from './protocol';
import type { ChatTransport, IncomingMessage, TransportSink, Withdrawal } from './transport';
import type {
  ProtocolChatId,
  GroupMember,
  MessageContent,
  MessageId,
  ParticipantId,
  SelfParticipant,
  Unsubscribe,
  ProtocolMessage,
  ProtocolChat,
} from './types';

export class StoreBackedSession implements ChatSession, TransportSink {
  readonly self: SelfParticipant;

  private readonly chats = new Map<ProtocolChatId, TransportChat>();
  private readonly messageListeners = new Set<(message: ProtocolMessage) => void>();
  private readonly chatListeners = new Set<(chat: ProtocolChat) => void>();
  private readonly history = new HistoryTracker();
  private readonly opening = new Map<ProtocolChatId, Promise<void>>();
  private deliveries = Promise.resolve();
  private failedDelivery: string | undefined;
  private acceptingDeliveries = true;

  constructor(
    private readonly transport: ChatTransport,
    private readonly store: MessageStore
  ) {
    this.self = transport.self;
  }

  async hydrate(): Promise<void> {
    const stored = await this.store.loadChats<ProtocolChatId>(this.transport.protocolId);
    for (const chat of stored) this.remember(chat);
    for (const chat of this.chats.values()) {
      if (!chat.hidden) void this.open(chat)?.catch(() => {});
    }
  }

  deliverToParticipants(
    participants: ParticipantId[],
    incoming: IncomingMessage,
    meta?: { title?: string; createdAt?: number }
  ): Promise<void> {
    if (!this.acceptingDeliveries) return Promise.resolve();
    return this.enqueueDelivery(async () => {
      const id = this.transport.chatIdFor(participants);
      const existing = this.chats.get(id);
      const chat = existing
        ? {
            ...existing,
            title: meta?.title ?? existing.title,
            createdAt:
              meta?.createdAt === undefined
                ? existing.createdAt
                : Math.min(existing.createdAt, meta.createdAt),
            hidden: false,
          }
        : this.build(participants, meta?.title, meta?.createdAt);
      await this.deliver(chat, incoming, !existing || existing.hidden);
    });
  }

  withdraw(participants: ParticipantId[], withdrawal: Withdrawal): Promise<void> {
    if (!this.acceptingDeliveries) return Promise.resolve();
    return this.enqueueDelivery(async () => {
      const chat = this.chats.get(this.transport.chatIdFor(participants));
      if (!chat) return;
      const undone = await this.store.getMessage(chat.id, withdrawal.undoes);
      if (undone?.content.kind !== 'reaction' || undone.senderId !== withdrawal.senderId) return;
      const { undoes: _, ...message } = withdrawal;
      const removal = { ...message, content: { ...undone.content, action: 'removed' as const } };
      await this.deliver(chat, after(undone, removal), false);
    });
  }

  private async deliver(chat: TransportChat, incoming: IncomingMessage, isNew: boolean) {
    if (chat.blocked && !incoming.fromMe) return;
    const visible = { ...chat, hidden: false };
    const message: ProtocolMessage = {
      ...incoming,
      chatId: visible.id,
      status: 'sent',
    };

    let inserted: boolean;
    const deliveryKey = `${visible.id}:${message.id}`;
    try {
      inserted = await this.store.insertMessage(
        message,
        this.snapshot(visible),
        incoming.transportTimestamp
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown storage error';
      const failure = new Error(`Could not save message history: ${detail}`);
      this.failedDelivery = deliveryKey;
      this.history.reportFailure(failure);
      throw failure;
    }

    if (this.failedDelivery === deliveryKey) {
      this.failedDelivery = undefined;
      this.history.clearFailure();
    }
    this.remember(visible);
    if (isNew) this.announce(visible, showsInPreview(message) ? message : undefined);
    if (inserted) for (const listener of this.messageListeners) listener(message);
  }

  private enqueueDelivery(work: () => Promise<void>): Promise<void> {
    const result = this.deliveries.then(work, work);
    this.deliveries = result.catch(() => {});
    return result;
  }
  private build(participants: ParticipantId[], title?: string, createdAt?: number): TransportChat {
    const sorted = [...new Set([...participants, this.self.participantId])].sort();
    return {
      id: this.transport.chatIdFor(sorted),
      protocolId: this.transport.protocolId,
      participants: sorted,
      title,
      createdAt: createdAt ?? Date.now(),
      hidden: false,
    };
  }
  private remember(chat: TransportChat): void {
    this.chats.set(chat.id, chat);
  }
  private open(chat: TransportChat): Promise<void> | undefined {
    if (!this.transport.openChat) return;
    const existing = this.opening.get(chat.id);
    if (existing) return existing;
    const work = this.history
      .run(async () => {
        const since = await this.store.newestTransportTimestamp(
          this.transport.protocolId,
          Number.POSITIVE_INFINITY,
          chat.id
        );
        await this.transport.openChat!(this.snapshot(chat), { since });
      })
      .finally(() => this.opening.delete(chat.id));
    this.opening.set(chat.id, work);
    return work;
  }

  newestSeenAt(notAfter = Number.POSITIVE_INFINITY): Promise<number | undefined> {
    return this.store.newestTransportTimestamp(this.transport.protocolId, notAfter);
  }
  private announce(chat: TransportChat, lastMessage?: ProtocolMessage): void {
    const projected = this.toChat(chat, lastMessage);
    for (const listener of this.chatListeners) listener(projected);
  }
  private toChat(chat: TransportChat, lastMessage?: ProtocolMessage): ProtocolChat {
    const others = chat.participants.filter((id) => id !== this.self.participantId);
    return {
      id: chat.id,
      kind: others.length > 1 ? 'group' : 'dm',
      title: chat.title?.trim() || (others[0] ?? this.self.participantId),
      memberIds: chat.participants,
      createdAt: chat.createdAt,
      consent: 'accepted',
      ...(chat.blocked ? { blocked: true } : {}),
      lastMessage,
      selfRole: undefined,
    };
  }
  private require(id: ProtocolChatId): TransportChat {
    const chat = this.chats.get(id);
    if (!chat) throw new Error(`Chat ${id} not found`);
    return chat;
  }
  private async ensure(others: ParticipantId[], title?: string): Promise<TransportChat> {
    const participants = [...new Set([...others, this.self.participantId])].sort();
    const id = this.transport.chatIdFor(participants);
    const existing = this.chats.get(id);
    const chat = existing
      ? { ...existing, hidden: false, title: title ?? existing.title }
      : this.build(participants, title);

    if (!existing || existing.hidden || title) await this.store.upsertChat(chat);
    this.remember(chat);
    if (!existing) void this.open(chat)?.catch(() => {});
    return chat;
  }

  async whenListed(first: ProtocolChat[]): Promise<ProtocolChat[]> {
    return first;
  }

  async listChats(): Promise<ProtocolChat[]> {
    const [stored, latest] = await Promise.all([
      this.store.loadChats<ProtocolChatId>(this.transport.protocolId),
      this.store.latestMessages<ProtocolChatId>(this.transport.protocolId),
    ]);
    return stored
      .filter((chat) => !chat.hidden)
      .map((chat) => this.toChat(chat, latest.get(chat.id)));
  }

  async getMessages(
    id: ProtocolChatId,
    opts?: {
      limit?: number;
      before?: { sentAt: number; id: MessageId };
    }
  ): Promise<ProtocolMessage[]> {
    if (!this.chats.has(id)) return [];
    return this.store.loadMessages(id, opts?.limit, opts?.before);
  }

  async resolveParticipant(addressOrId: string): Promise<ParticipantId | null> {
    return this.transport.resolveParticipant(addressOrId);
  }

  async resolveAddresses(ids: ParticipantId[]): Promise<Record<ParticipantId, string>> {
    return this.transport.resolveAddresses(ids);
  }

  async createDm(participant: ParticipantId): Promise<ProtocolChat> {
    return this.toChat(await this.ensure([participant]));
  }

  async createGroup(participants: ParticipantId[], title: string): Promise<ProtocolChat> {
    return this.toChat(await this.ensure(participants, title));
  }

  async getMembers(id: ProtocolChatId): Promise<GroupMember[]> {
    return this.require(id).participants.map((participant) => ({
      id: participant,
      role: 'member',
    }));
  }

  async addMembers(_id: ProtocolChatId, _participants: ParticipantId[]): Promise<void> {
    throw new Error(this.transport.rosterIsFixed.onAdd);
  }

  async removeMembers(_id: ProtocolChatId, _participants: ParticipantId[]): Promise<void> {
    throw new Error(this.transport.rosterIsFixed.onRemove);
  }

  async renameGroup(id: ProtocolChatId, title: string): Promise<void> {
    await this.update({ ...this.require(id), title });
  }

  async setBlocked(id: ProtocolChatId, blocked: boolean): Promise<void> {
    const chat = this.require(id);
    if (chat.participants.length > 2) throw new UnsupportedError('Only a DM can be blocked.');
    await this.update({ ...chat, blocked });
  }

  private async update(chat: TransportChat): Promise<void> {
    await this.store.upsertChat(chat);
    this.remember(chat);
    const latest = await this.store.latestMessages(this.transport.protocolId, chat.id);
    this.announce(chat, latest.get(chat.id));
  }

  async leaveGroup(id: ProtocolChatId): Promise<void> {
    const chat = { ...this.require(id), hidden: true };
    await this.store.upsertChat(chat);
    this.remember(chat);
  }

  async send(id: ProtocolChatId, content: MessageContent, replyTo?: MessageId): Promise<MessageId> {
    const chat = this.require(id);
    const undone =
      content.kind === 'reaction' && content.action === 'removed'
        ? await this.ownReaction(id, content.targetId, content.emoji)
        : undefined;
    const result = await this.transport.send(this.snapshot(chat), content, {
      replyTo,
      undoes: undone?.id,
    });
    const local = result.localMessage;
    if (local) {
      await this.enqueueDelivery(() =>
        this.deliver(chat, undone ? after(undone, local) : local, false)
      );
    }
    this.transport.confirmSend?.(id, result.id);
    return result.id;
  }

  private async ownReaction(id: ProtocolChatId, targetId: MessageId, emoji: string) {
    const recent = await this.store.loadMessages(id, HYDRATE_LIMIT);
    const mine = recent.findLast(
      ({ fromMe, content }) =>
        fromMe &&
        content.kind === 'reaction' &&
        content.action === 'added' &&
        content.targetId === targetId &&
        content.emoji === emoji
    );
    if (!mine) throw new Error('That reaction is too old to take back.');
    return mine;
  }

  async sync(): Promise<void> {
    await this.deliveries;
    await this.history.run(async () => {
      const results = await Promise.allSettled(
        [...this.chats.values()].filter((chat) => !chat.hidden).map((chat) => this.open(chat))
      );
      await this.transport.sync();
      await this.deliveries;
      const failed = results.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
    });
  }

  countUnread(id: ProtocolChatId, since: number): Promise<number> {
    return this.store.countUnreadMessages(id, since);
  }

  subscribeHistory(listener: (state: HistoryState) => void): Unsubscribe {
    return this.history.subscribe(listener);
  }

  async streamMessages(onMessage: (message: ProtocolMessage) => void): Promise<Unsubscribe> {
    this.messageListeners.add(onMessage);
    return () => this.messageListeners.delete(onMessage);
  }

  async streamChats(onChat: (chat: ProtocolChat) => void): Promise<Unsubscribe> {
    this.chatListeners.add(onChat);
    return () => this.chatListeners.delete(onChat);
  }

  async disconnect(): Promise<void> {
    this.acceptingDeliveries = false;
    try {
      await this.transport.disconnect();
    } finally {
      await this.deliveries;
      this.messageListeners.clear();
      this.chatListeners.clear();
    }
  }

  private snapshot(chat: TransportChat): TransportChat {
    return { ...chat, participants: [...chat.participants] };
  }
}

/** A transport may time messages to the second, and a removal must still sort after what it removes. */
function after(earlier: { sentAt: number }, message: IncomingMessage): IncomingMessage {
  return { ...message, sentAt: Math.max(message.sentAt, earlier.sentAt + 1) };
}

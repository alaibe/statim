import { isParticipantId } from './bots';
import { showsInPreview } from './message-rules';
import { protocolChatId } from './namespace';
import type { ChatSession } from './protocol';
import type {
  ProtocolChatId,
  GroupMember,
  GroupRole,
  MessageContent,
  MessageId,
  ParticipantId,
  SelfParticipant,
  Unsubscribe,
  ConsentDecision,
  ProtocolMessage,
  ProtocolChat,
} from './types';

export class InMemoryChatSession implements ChatSession {
  readonly self: SelfParticipant;
  readonly sendsCustom = true;

  private chats = new Map<ProtocolChatId, ProtocolChat>();
  private messages = new Map<ProtocolChatId, ProtocolMessage[]>();
  private addresses = new Map<ParticipantId, string>();
  private roles = new Map<string, GroupRole>();

  private messageListeners = new Set<(m: ProtocolMessage) => void>();
  private chatListeners = new Set<(c: ProtocolChat) => void>();

  readonly sent: { chatId: ProtocolChatId; content: MessageContent }[] = [];
  readonly left: ProtocolChatId[] = [];
  syncCount = 0;
  disconnected = false;
  erased = false;

  constructor(self?: Partial<SelfParticipant>) {
    this.self = {
      participantId: 'a'.repeat(64),
      address: '0x1111111111111111111111111111111111111111',
      ...self,
    };
  }

  seedChat(partial: Omit<Partial<ProtocolChat>, 'id'> & { id: string }): ProtocolChat {
    const chat: ProtocolChat = {
      kind: 'dm',
      title: partial.id,
      memberIds: [this.self.participantId, 'b'.repeat(64)],
      createdAt: 1_000,
      consent: 'accepted',
      ...partial,
      id: protocolChatId(partial.id),
    };
    this.chats.set(chat.id, chat);
    this.messages.set(chat.id, this.messages.get(chat.id) ?? []);
    return chat;
  }

  seedAddress(participantId: ParticipantId, address: string) {
    this.addresses.set(participantId, address);
  }

  seedRole(chatId: string, participantId: ParticipantId, role: GroupRole) {
    this.roles.set(`${chatId}:${participantId}`, role);
  }

  deliver(id: string, message: Partial<ProtocolMessage> = {}): ProtocolMessage {
    const chatId = protocolChatId(id);
    const chat = this.requireChat(chatId);
    const full: ProtocolMessage = {
      id: `remote-${Math.random().toString(36).slice(2, 8)}`,
      chatId,
      senderId: 'b'.repeat(64),
      sentAt: 2_000,
      content: { kind: 'text', text: 'hello from the protocol' },
      fromMe: false,
      status: 'sent',
      ...message,
    };

    this.messages.set(chatId, [...(this.messages.get(chatId) ?? []), full]);

    if (showsInPreview(full)) {
      const newer = (chat.lastMessage?.sentAt ?? 0) <= full.sentAt;
      if (newer) this.chats.set(chatId, { ...chat, lastMessage: full });
    }

    for (const listener of this.messageListeners) listener(full);
    return full;
  }

  announce(announced: Omit<ProtocolChat, 'id'> & { id: string }) {
    const chat = { ...announced, id: protocolChatId(announced.id) };
    this.chats.set(chat.id, chat);
    for (const listener of this.chatListeners) listener(chat);
  }

  async whenListed(first: ProtocolChat[]): Promise<ProtocolChat[]> {
    return first;
  }

  async listChats(): Promise<ProtocolChat[]> {
    return [...this.chats.values()];
  }

  async getMessages(
    id: ProtocolChatId,
    opts?: { limit?: number; before?: { sentAt: number; id: MessageId } }
  ): Promise<ProtocolMessage[]> {
    const messages = [...(this.messages.get(id) ?? [])]
      .filter(
        (message) =>
          !opts?.before ||
          message.sentAt < opts.before.sentAt ||
          (message.sentAt === opts.before.sentAt && message.id < opts.before.id)
      )
      .sort((a, b) => a.sentAt - b.sentAt || a.id.localeCompare(b.id));
    return opts?.limit ? messages.slice(-opts.limit) : messages;
  }

  async resolveParticipant(addressOrId: string): Promise<ParticipantId | null> {
    if (isParticipantId(addressOrId)) return addressOrId;
    for (const [participantId, address] of this.addresses) {
      if (address.toLowerCase() === addressOrId.toLowerCase()) return participantId;
    }
    return null;
  }

  async resolveAddresses(ids: ParticipantId[]): Promise<Record<ParticipantId, string>> {
    const out: Record<ParticipantId, string> = {};
    for (const id of ids) {
      const address = this.addresses.get(id);
      if (address) out[id] = address;
    }
    return out;
  }

  async createDm(participant: ParticipantId): Promise<ProtocolChat> {
    return this.seedChat({
      id: `dm-${participant.slice(0, 6)}`,
      memberIds: [this.self.participantId, participant],
      title: participant,
    });
  }

  async createGroup(participants: ParticipantId[], title: string): Promise<ProtocolChat> {
    return this.seedChat({
      id: `group-${title}`,
      kind: 'group',
      title,
      memberIds: [this.self.participantId, ...participants],
      selfRole: 'owner',
    });
  }

  private requireChat(id: ProtocolChatId): ProtocolChat {
    const chat = this.chats.get(id);
    if (!chat) throw new Error(`Chat ${id} not found`);
    return chat;
  }

  private requireGroup(id: ProtocolChatId): ProtocolChat {
    const chat = this.requireChat(id);
    if (chat.kind !== 'group') throw new Error('That only works in a group.');
    return chat;
  }

  async getMembers(id: ProtocolChatId): Promise<GroupMember[]> {
    const chat = this.requireGroup(id);
    return chat.memberIds.map((memberId) => ({
      id: memberId,
      role:
        this.roles.get(`${id}:${memberId}`) ??
        (memberId === this.self.participantId ? 'owner' : 'member'),
    }));
  }

  async addMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void> {
    const chat = this.requireGroup(id);
    const next = {
      ...chat,
      memberIds: [...new Set([...chat.memberIds, ...participants])],
    };
    this.chats.set(id, next);
    for (const listener of this.chatListeners) listener(next);
  }

  async removeMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void> {
    const chat = this.requireGroup(id);
    const drop = new Set(participants);
    const next = {
      ...chat,
      memberIds: chat.memberIds.filter((m) => !drop.has(m)),
    };
    this.chats.set(id, next);
    for (const listener of this.chatListeners) listener(next);
  }

  async renameGroup(id: ProtocolChatId, title: string): Promise<void> {
    const chat = this.requireGroup(id);
    const next = { ...chat, title };
    this.chats.set(id, next);
    for (const listener of this.chatListeners) listener(next);
  }

  async leaveGroup(id: ProtocolChatId): Promise<void> {
    this.requireGroup(id);
    this.chats.delete(id);
    this.left.push(id);
  }

  async setConsent(id: ProtocolChatId, consent: ConsentDecision): Promise<void> {
    const chat = this.requireChat(id);
    const next = { ...chat, consent };
    this.chats.set(id, next);
    for (const listener of this.chatListeners) listener(next);
  }

  async setBlocked(id: ProtocolChatId, blocked: boolean): Promise<void> {
    const chat = this.requireChat(id);
    const next = { ...chat, blocked };
    this.chats.set(id, next);
    for (const listener of this.chatListeners) listener(next);
  }

  async send(id: ProtocolChatId, content: MessageContent, replyTo?: MessageId): Promise<MessageId> {
    this.requireChat(id);

    this.sent.push({ chatId: id, content });
    const messageId = `sent-${this.sent.length}`;
    const outbound: ProtocolMessage = {
      id: messageId,
      chatId: id,
      senderId: this.self.participantId,
      sentAt: 3_000,
      content,
      fromMe: true,
      status: 'sent',
      replyTo,
    };

    this.messages.set(id, [...(this.messages.get(id) ?? []), outbound]);
    return messageId;
  }

  async sync(): Promise<void> {
    this.syncCount += 1;
  }

  async streamMessages(onMessage: (m: ProtocolMessage) => void): Promise<Unsubscribe> {
    this.messageListeners.add(onMessage);
    return () => this.messageListeners.delete(onMessage);
  }

  async streamChats(onChat: (c: ProtocolChat) => void): Promise<Unsubscribe> {
    this.chatListeners.add(onChat);
    return () => this.chatListeners.delete(onChat);
  }

  async disconnect(): Promise<void> {
    this.disconnected = true;
    this.messageListeners.clear();
    this.chatListeners.clear();
  }

  async eraseLocalDatabase(): Promise<void> {
    this.erased = true;
    this.chats.clear();
    this.messages.clear();
  }
}

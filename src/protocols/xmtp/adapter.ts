import {
  Client,
  type ConsentState,
  ConversationVersion,
  Dm,
  Group,
  PublicIdentity,
  type Signer,
  type Conversation as XmtpConversation,
  type DecodedMessage,
  type ConversationId as XmtpConversationId,
  type InboxId,
  type JSContentCodec,
  type XMTPEnvironment,
} from '@xmtp/react-native-sdk';
import { isAddress, type LocalAccount } from 'viem';

import {
  classifyAttachment,
  fallbackMimeType,
  readInlineAttachment,
  writeInlineAttachment,
} from '@/core/messaging/attachments';
import { protocolChatId } from '@/core/messaging/namespace';
import type { ChatSession, GroupInfo, XmtpInstallation } from '@/core/messaging/protocol';
import type {
  Chat,
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
} from '@/core/messaging/types';
import { isParticipantId } from '@/core/messaging/bots';
import { PLUGIN_AUTHORITY } from './codec';
import { fallbackFilename, xmtpEnvironment } from './shared';
import type { AccountStorage } from '@/storage/account';

function signerForAccount(account: LocalAccount): Signer {
  return {
    getIdentifier: async () => new PublicIdentity(account.address, 'ETHEREUM'),
    getChainId: () => undefined,
    getBlockNumber: () => undefined,
    signerType: () => 'EOA',
    signMessage: async (message: string) => ({
      signature: await account.signMessage({ message }),
    }),
  };
}

function inboxOf(account: LocalAccount, env: XMTPEnvironment): Promise<InboxId> {
  return Client.getOrCreateInboxId(new PublicIdentity(account.address, 'ETHEREUM'), env);
}

/** Read from the network, so it works while this device cannot register, as when the inbox is full. */
export async function inboxInstallations(
  account: LocalAccount,
  env: XMTPEnvironment = xmtpEnvironment()
): Promise<XmtpInstallation[]> {
  const [state] = await Client.inboxStatesForInboxIds(env, [await inboxOf(account, env)]);
  return (state?.installations ?? []).map((installation) => ({
    id: installation.id,
    createdAt: installation.createdAt,
    current: false,
  }));
}

export async function revokeInboxInstallations(
  account: LocalAccount,
  ids: string[],
  env: XMTPEnvironment = xmtpEnvironment()
): Promise<void> {
  await Client.revokeInstallations(
    env,
    signerForAccount(account),
    await inboxOf(account, env),
    ids as Parameters<typeof Client.revokeInstallations>[3]
  );
}

export interface XmtpConnectOptions {
  accountId: string;
  account: LocalAccount;
  dbEncryptionKey: Uint8Array;
  env?: XMTPEnvironment;
  codecs?: JSContentCodec<any>[];
  appVersion?: string;
  /** Where the inbox id is remembered between launches. */
  storage?: AccountStorage;
}

export interface XmtpEraseOptions {
  address: string;
  dbEncryptionKey: Uint8Array;
  env?: XMTPEnvironment;
}

export async function eraseXmtpLocalDatabase(options: XmtpEraseOptions): Promise<void> {
  const client = await Client.build(new PublicIdentity(options.address, 'ETHEREUM'), {
    env: options.env ?? xmtpEnvironment(),
    dbEncryptionKey: options.dbEncryptionKey,
  });
  await client.deleteLocalDatabase();
}

export class XmtpSession implements ChatSession {
  readonly self: SelfParticipant;
  readonly sendsCustom = true;

  private readonly addressCache = new Map<ParticipantId, string>();
  private readonly deletedListeners = new Set<(id: ProtocolChatId, ids: MessageId[]) => void>();
  private closed = false;

  private constructor(
    private readonly client: Client<any>,
    private readonly codecsByTypeId: Map<string, JSContentCodec<any>>,
    private readonly account: LocalAccount,
    private readonly accountId: string
  ) {
    this.self = {
      participantId: client.inboxId,
      address: client.publicIdentity.identifier,
    };
  }

  static async connect(opts: XmtpConnectOptions): Promise<XmtpSession> {
    const codecs = opts.codecs ?? [];
    const options = {
      env: opts.env ?? xmtpEnvironment(),
      dbEncryptionKey: opts.dbEncryptionKey,
      appVersion: opts.appVersion,
      codecs,
    };

    const inboxKey = `xmtp.inboxId.${options.env}`;
    const knownInboxId = (await opts.storage?.get<InboxId>(inboxKey)) ?? undefined;
    const client = await Client.build(
      new PublicIdentity(opts.account.address, 'ETHEREUM'),
      options,
      knownInboxId
    ).catch(async () => Client.create(signerForAccount(opts.account), options));
    if (client.inboxId !== knownInboxId) await opts.storage?.set(inboxKey, client.inboxId);

    const byTypeId = new Map<string, JSContentCodec<any>>();
    for (const codec of codecs) byTypeId.set(codec.contentType.typeId, codec);

    return new XmtpSession(client, byTypeId, opts.account, opts.accountId);
  }

  async whenListed(first: ProtocolChat[]): Promise<ProtocolChat[]> {
    return first;
  }

  async listChats(): Promise<ProtocolChat[]> {
    const raw = await this.client.conversations.list(
      { lastMessage: true },
      undefined,
      ['allowed', 'unknown'],
      undefined,
      undefined,
      undefined,
      undefined,
      'last_activity'
    );
    return Promise.all(raw.map((c) => this.toChat(c)));
  }

  async getMessages(id: ProtocolChatId, opts?: { limit?: number }): Promise<ProtocolMessage[]> {
    const conversation = await this.client.conversations.findConversation(toXmtpId(id));
    if (!conversation) return [];

    const messages = await conversation.messages({ limit: opts?.limit ?? 100 });
    return (await Promise.all(messages.map((m) => this.toMessage(m, id)))).reverse();
  }

  async countUnread(id: ProtocolChatId, since: number): Promise<number> {
    const conversation = await this.client.conversations.findConversation(toXmtpId(id));
    if (!conversation) return 0;
    const messages = await conversation.messages({
      limit: 1000,
      ...(since > 0 ? { afterNs: since * 1_000_000 } : {}),
      excludeSenderInboxIds: [this.self.participantId],
    });
    return messages.filter(
      (message) =>
        !['reaction', 'readReceipt', 'group_updated'].some((kind) =>
          message.contentTypeId.startsWith(`xmtp.org/${kind}:`)
        )
    ).length;
  }

  async resolveParticipant(addressOrId: string): Promise<ParticipantId | null> {
    const trimmed = addressOrId.trim();

    if (isParticipantId(trimmed)) return trimmed as InboxId;
    if (!isAddress(trimmed)) return null;

    const identity = new PublicIdentity(trimmed, 'ETHEREUM');
    const reachable = await this.client.canMessage([identity]);
    if (!reachable[identity.identifier]) return null;

    const inboxId = await this.client.findInboxIdFromIdentity(identity);
    return inboxId ?? null;
  }

  async resolveAddresses(ids: ParticipantId[]): Promise<Record<ParticipantId, string>> {
    const out: Record<ParticipantId, string> = {};
    const missing: ParticipantId[] = [];

    for (const id of ids) {
      const cached = this.addressCache.get(id);
      if (cached) out[id] = cached;
      else missing.push(id);
    }

    if (missing.length > 0) {
      try {
        const states = await this.client.inboxStates(false, missing as InboxId[]);
        for (const state of states) {
          const address = state.identities.find((i) => i.kind === 'ETHEREUM')?.identifier;
          if (!address) continue;
          this.addressCache.set(state.inboxId, address);
          out[state.inboxId] = address;
        }
      } catch (error) {
        console.warn('[xmtp] could not resolve addresses', error);
      }
    }

    return out;
  }

  async createDm(participant: ParticipantId): Promise<ProtocolChat> {
    const dm = await this.client.conversations.findOrCreateDm(participant as InboxId);
    return this.toChat(dm as unknown as XmtpConversation<any>);
  }

  async createGroup(participants: ParticipantId[], title: string): Promise<ProtocolChat> {
    const group = await this.client.conversations.newGroup(participants as InboxId[], {
      name: title,
    });
    return this.toChat(group as unknown as XmtpConversation<any>);
  }

  private async requireGroup(id: ProtocolChatId): Promise<Group<any>> {
    const conversation = await this.client.conversations.findConversation(toXmtpId(id));
    if (!conversation) throw new Error(`Chat ${id} not found`);
    if (conversation.version !== ConversationVersion.GROUP) {
      throw new Error('That only works in a group.');
    }
    return conversation as Group<any>;
  }

  async getMembers(id: ProtocolChatId): Promise<GroupMember[]> {
    const members = await (await this.requireGroup(id)).members();
    return members.map((m) => ({ id: m.inboxId, role: mapRole(m.permissionLevel) }));
  }

  async getGroupInfo(id: ProtocolChatId): Promise<GroupInfo> {
    const group = await this.requireGroup(id);
    const [description, avatarUri, members] = await Promise.all([
      group.description(),
      group.imageUrl(),
      group.members(),
    ]);
    return { description, avatarUri: avatarUri || undefined, memberCount: members.length };
  }

  async addMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void> {
    await (await this.requireGroup(id)).addMembers(participants as InboxId[]);
  }

  async removeMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void> {
    await (await this.requireGroup(id)).removeMembers(participants as InboxId[]);
  }

  async renameGroup(id: ProtocolChatId, title: string): Promise<void> {
    await (await this.requireGroup(id)).updateName(title);
  }

  async leaveGroup(id: ProtocolChatId): Promise<void> {
    await (await this.requireGroup(id)).leaveGroup();
  }

  async send(id: ProtocolChatId, content: MessageContent, replyTo?: MessageId): Promise<MessageId> {
    const conversation = await this.client.conversations.findConversation(toXmtpId(id));
    if (!conversation) throw new Error(`Chat ${id} not found`);

    if (replyTo && content.kind === 'text') {
      return conversation.send({
        reply: { reference: replyTo as never, content: { text: content.text } },
      });
    }

    if (content.kind === 'text') {
      return conversation.send({ text: content.text });
    }

    if (content.kind === 'custom') {
      const codec = this.codecsByTypeId.get(content.typeId);
      if (!codec) {
        throw new Error(
          `No codec registered for "${content.typeId}". Is the owning plugin enabled?`
        );
      }
      type CodecPayload = Parameters<typeof codec.encode>[0];
      return conversation.send(content.data as CodecPayload, {
        contentType: codec.contentType,
      });
    }

    if (content.kind === 'image' || content.kind === 'file' || content.kind === 'voice') {
      const filename =
        content.kind === 'file'
          ? content.name
          : (content.name ?? fallbackFilename(content.uri, content.kind));
      const mimeType = content.mimeType ?? fallbackMimeType(filename);

      const attachment = await readInlineAttachment(content.uri, filename, mimeType);
      return conversation.send({ attachment });
    }

    if (content.kind === 'reaction') {
      return conversation.send({
        reaction: {
          reference: content.targetId,
          action: content.action,
          schema: 'unicode',
          content: content.emoji,
        },
      });
    }

    throw new Error(`Cannot send content of kind "${content.kind}"`);
  }

  async deleteMessage(id: ProtocolChatId, messageId: MessageId): Promise<void> {
    const conversation = await this.client.conversations.findConversation(toXmtpId(id));
    if (!conversation) throw new Error(`Chat ${id} not found`);
    await conversation.deleteMessage(messageId as Parameters<typeof conversation.deleteMessage>[0]);
  }

  async streamDeletedMessages(
    listener: (id: ProtocolChatId, messageIds: MessageId[]) => void
  ): Promise<Unsubscribe> {
    this.deletedListeners.add(listener);
    return () => this.deletedListeners.delete(listener);
  }

  async setConsent(id: ProtocolChatId, consent: ConsentDecision): Promise<void> {
    const conversation = await this.client.conversations.findConversation(toXmtpId(id));
    if (!conversation) return;
    await conversation.updateConsent(consent === 'accepted' ? 'allowed' : 'denied');
  }

  async sendReadReceipt(id: ProtocolChatId): Promise<void> {
    const conversation = await this.client.conversations.findConversation(toXmtpId(id));
    if (!conversation) return;
    await conversation.send({ readReceipt: {} });
  }

  async listInstallations(): Promise<XmtpInstallation[]> {
    const state = await this.client.inboxState(true);
    const current = this.client.installationId;

    return state.installations.map((installation) => ({
      id: installation.id,
      createdAt: installation.createdAt,
      current: installation.id === current,
    }));
  }

  async revokeInstallations(ids: string[]): Promise<void> {
    await Client.revokeInstallations(
      xmtpEnvironment(),
      signerForAccount(this.account),
      this.client.inboxId,
      ids as Parameters<typeof Client.revokeInstallations>[3]
    );
  }

  async sync(): Promise<void> {
    await this.client.conversations.syncAllConversations(['allowed', 'unknown']);
  }

  async streamMessages(onMessage: (m: ProtocolMessage) => void): Promise<Unsubscribe> {
    await this.client.conversations.streamAllMessages(
      async (message) => {
        if (this.closed || isReadReceipt(message)) return;
        const id =
          GROUP_TOPIC.exec(message.topic)?.[1] ??
          (await this.client.conversations.findConversationByTopic(message.topic))?.id;
        if (!id || this.closed) return;
        const chatId = protocolChatId(id);
        const deletedId = message.nativeContent?.deleteMessage?.messageId;
        if (deletedId) {
          for (const listener of this.deletedListeners) listener(chatId, [deletedId]);
          return;
        }
        onMessage(await this.toMessage(message, chatId));
      },
      'all',
      ['allowed', 'unknown']
    );
    return () => this.client.conversations.cancelStreamAllMessages();
  }

  async streamChats(onChat: (c: ProtocolChat) => void): Promise<Unsubscribe> {
    await this.client.conversations.stream(async (conversation) => {
      const converted = await this.toChat(conversation, () => !this.closed);
      if (!this.closed) onChat(converted);
    });
    return () => this.client.conversations.cancelStream();
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    this.client.conversations.cancelStream();
    this.client.conversations.cancelStreamAllMessages();
  }

  async eraseLocalDatabase(): Promise<void> {
    await this.client.deleteLocalDatabase();
  }

  private async toChat(
    raw: XmtpConversation<any>,
    current: () => boolean = () => true
  ): Promise<ProtocolChat> {
    const isGroup = raw.version === ConversationVersion.GROUP;

    let title: string;
    let memberIds: ParticipantId[] = [];

    let selfRole: GroupRole | undefined;

    if (isGroup) {
      const group = raw as Group<any>;
      const members = await group.members();
      title = group.groupName?.trim() || 'Untitled group';
      memberIds = members.map((m) => m.inboxId);
      selfRole = mapRole(
        members.find((m) => m.inboxId === this.self.participantId)?.permissionLevel
      );
    } else {
      const participant = await (raw as Dm<any>).peerInboxId();
      title = participant;
      memberIds = [participant, this.self.participantId];
    }

    return {
      id: protocolChatId(raw.id),
      kind: isGroup ? 'group' : 'dm',
      title,
      memberIds,
      createdAt: raw.createdAt,
      consent: mapConsent(raw.state),
      selfRole,
      lastMessage: current() ? await this.previewOf(raw) : undefined,
    };
  }

  private async previewOf(raw: XmtpConversation<any>): Promise<ProtocolMessage | undefined> {
    const last = raw.lastMessage;
    if (!last) return undefined;
    const shown = isReadReceipt(last)
      ? (await raw.messages({ limit: 5 })).find((message) => !isReadReceipt(message))
      : last;
    return shown ? this.toMessage(shown, protocolChatId(raw.id)) : undefined;
  }

  private async toMessage(
    raw: DecodedMessage<any>,
    chatId: ProtocolChatId
  ): Promise<ProtocolMessage> {
    return {
      id: raw.id,
      chatId,
      senderId: raw.senderInboxId,
      sentAt: Math.round(raw.sentNs / 1_000_000),
      fromMe: raw.senderInboxId === this.self.participantId,
      status: raw.deliveryStatus === 'FAILED' ? 'failed' : 'sent',
      content: await this.toContent(raw),
      replyTo: raw.nativeContent?.reply?.reference,
    };
  }

  private async toContent(raw: DecodedMessage<any>): Promise<MessageContent> {
    const native = raw.nativeContent;

    if (typeof native?.text === 'string') {
      return { kind: 'text', text: native.text };
    }

    if (native?.groupUpdated) {
      return { kind: 'system', text: describeGroupUpdate(native.groupUpdated) };
    }

    if (native?.attachment) {
      const { filename, mimeType, data } = native.attachment;
      const uri = await writeInlineAttachment(raw.id, { filename, mimeType, data }, this.accountId);
      const kind = classifyAttachment(mimeType, filename);

      if (kind === 'image') return { kind: 'image', uri, name: filename, mimeType };
      if (kind === 'voice') {
        return { kind: 'voice', uri, durationMs: 0, name: filename, mimeType };
      }
      return { kind: 'file', uri, name: filename, mimeType };
    }

    if (native?.reply) {
      const inner = native.reply.content;
      if (typeof inner?.text === 'string') {
        return { kind: 'text', text: inner.text };
      }
      return { kind: 'unsupported', typeId: 'reply', fallback: raw.fallback ?? 'Reply' };
    }

    const reaction = native?.reaction ?? native?.reactionV2;
    if (reaction) {
      return {
        kind: 'reaction',
        targetId: reaction.reference,
        emoji: reaction.content,
        action: reaction.action === 'removed' ? 'removed' : 'added',
      };
    }

    const contentTypeId = raw.contentTypeId ?? '';
    if (contentTypeId.startsWith(PLUGIN_AUTHORITY)) {
      const typeId = parseTypeId(contentTypeId);

      if (native?.unknown) {
        return {
          kind: 'unsupported',
          typeId,
          fallback: raw.fallback ?? 'Unsupported message',
        };
      }

      try {
        return { kind: 'custom', typeId, data: raw.content(), fallback: raw.fallback };
      } catch {
        return { kind: 'unsupported', typeId, fallback: raw.fallback ?? 'Unsupported message' };
      }
    }

    return {
      kind: 'unsupported',
      typeId: parseTypeId(contentTypeId),
      fallback: raw.fallback ?? 'Unsupported message',
    };
  }
}

const GROUP_TOPIC = /\/xmtp\/mls\/1\/g-(.*?)\/proto/;

function toXmtpId(id: string): XmtpConversationId {
  return id as XmtpConversationId;
}

function isReadReceipt(message: DecodedMessage<any>): boolean {
  return message.contentTypeId.startsWith('xmtp.org/readReceipt:');
}

function parseTypeId(contentTypeId: string): string {
  const afterAuthority = contentTypeId.split('/').pop() ?? contentTypeId;
  return afterAuthority.split(':')[0];
}

function mapRole(level: 'member' | 'admin' | 'super_admin' | undefined): GroupRole {
  if (level === 'super_admin') return 'owner';
  if (level === 'admin') return 'admin';
  return 'member';
}

function mapConsent(state: ConsentState): Chat['consent'] {
  if (state === 'allowed') return 'accepted';
  if (state === 'denied') return 'declined';
  return 'request';
}

function describeGroupUpdate(update: {
  membersAdded: { inboxId: string }[];
  membersRemoved: { inboxId: string }[];
  metadataFieldsChanged: { fieldName: string; newValue: string }[];
}): string {
  const parts: string[] = [];
  if (update.membersAdded.length) parts.push(`${update.membersAdded.length} joined`);
  if (update.membersRemoved.length) parts.push(`${update.membersRemoved.length} left`);
  for (const field of update.metadataFieldsChanged) {
    if (field.fieldName === 'group_name') parts.push(`Renamed to "${field.newValue}"`);
  }
  return parts.join(' · ') || 'Group updated';
}

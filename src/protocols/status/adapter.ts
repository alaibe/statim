import { sha256 } from '@noble/hashes/sha2';

import { type DerivedKey, shortAddress } from '@/core/account/keyring';
import { HistoryTracker, PartialHistoryError, type HistoryState } from '@/core/messaging/history';
import type { MessageStore, TransportChat } from '@/core/messaging/message-store';
import { protocolChatId } from '@/core/messaging/namespace';
import type { ChatSession, GroupInfo, MentionCandidate } from '@/core/messaging/protocol';
import { emojiFromCodePoints } from '@/core/messaging/shortcodes';
import type {
  Consent,
  ConsentDecision,
  GroupMember,
  MessageContent,
  MessageId,
  ParticipantId,
  ProtocolChat,
  ProtocolChatId,
  ProtocolMessage,
  SelfParticipant,
  Unsubscribe,
} from '@/core/messaging/types';
import { fromHex, toHex } from '@/lib/bytes';
import { randomBytes } from '@/lib/random';
import type { ProtocolState } from '@/storage/protocol-state';

import {
  added,
  type ContactChange,
  type ContactState,
  dismissed,
  hasAddedUs,
  mutual,
  NEW_CONTACT,
  propagatedState,
  propagatedStateReceived,
  remoteRetracted,
  requestDismissed,
  requestReceived,
  requestSent,
} from './contacts';
import {
  type ApplicationMessage,
  openData,
  readApplication,
  sealEnvelope,
  syncMessageId,
  syncRecord,
  wrapApplication,
} from './envelope';
import {
  type GroupChange,
  type GroupEvent,
  GroupState,
  newGroupChatId,
  readGroupEvent,
  signGroupEvents,
} from './group';
import {
  compressPublicKey,
  decryptNonceFirst,
  publicKeyOf,
  randomPrivateKey,
  sharedSecret,
} from './crypto';
import {
  chatKeyOf,
  identityFrom,
  parseChatKey,
  participantIdOf,
  publicKeyFromParticipant,
  type StatusIdentity,
} from './keys';
import {
  AppType,
  AudioType,
  ContentType,
  decodeChatMessage,
  decodeContactRequestDecision,
  decodeContactUpdate,
  decodeDelete,
  decodeChatIdentity,
  decodeEdit,
  decodeMembershipUpdate,
  decodeReaction,
  encodeChatMessage,
  encodeContactRequestDecision,
  encodeContactUpdate,
  encodeDelete,
  encodeChatIdentity,
  encodeEdit,
  encodeMembershipUpdate,
  encodeMvds,
  encodeReaction,
  EventType,
  MessageType,
  type WireChatIdentity,
  type WireChatMessage,
  type WireDelete,
  type WireEdit,
  type WireIdentityImage,
  type WireReaction,
} from './messages';
import { fromStatusMentions, toStatusMentions } from './mentions';
import { StatusNode, type WakuMessage, type WakuNode } from './node';
import { decodePayload } from './payload';
import { type RatchetSession, Ratchets, type SignedPreKey, signedBundle } from './ratchet';
import { Reassembly, readSegment } from './segments';
import { partitionedTopic, personalTopic } from './topics';
import { statusAudio } from './voice';

export const STATUS_PROTOCOL_ID = 'status';

const POLL_INTERVAL_MS = 3_000;
const REFRESH_EVERY = 20;
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
/** Waku timestamps are the sender's clock; re-reading a little of the store absorbs its skew. */
const HISTORY_OVERLAP_MS = 10 * 60 * 1_000;
const MAX_CLOCK_DRIFT_MS = 120_000;
const MAX_TEXT_LENGTH = 4096;
const SEEN_LIMIT = 5_000;
const REQUEST_TEXT = 'Please add me to your contacts';
const VOICE_TEXT = 'Update to latest version to listen to an audio message here!';
const GROUP_COLOR = '#887af9';

const IMAGE_FORMATS: Record<number, string> = {
  1: 'image/png',
  2: 'image/jpeg',
  3: 'image/webp',
  4: 'image/gif',
};

/** The six reactions older Status clients send as a number instead of an emoji. */
const LEGACY_REACTIONS: Record<number, string> = {
  1: '2764',
  2: '1f44d',
  3: '1f44e',
  4: '1f602',
  5: '1f622',
  6: '1f620',
};

export interface StatusMedia {
  save(messageId: string, bytes: Uint8Array, mimeType: string): Promise<string>;
  load(uri: string, name: string, mimeType: string): Promise<Uint8Array>;
}

export interface StatusConnectOptions {
  derive(path: string): DerivedKey;
  /** An nwaku node's REST address; without one, Status's own nodes are used. */
  nodeUrl?: string;
  displayName?: string;
  store: MessageStore;
  state: ProtocolState;
  media: StatusMedia;
  fetchImpl?: typeof fetch;
  autoPoll?: boolean;
}

interface GroupRecord {
  events: string[];
  consent: Consent;
  picture?: string;
}

interface Group {
  state: GroupState;
  consent: Consent;
  picture?: string;
}

interface Outgoing {
  type: number;
  payload: Uint8Array;
  message: Omit<ProtocolMessage, 'id'>;
}

interface PendingSend {
  message: ProtocolMessage;
  remaining: Set<ParticipantId>;
  payload: Uint8Array;
}

interface PendingEdit {
  clock: number;
  text: string;
}

type Sendable = Extract<MessageContent, { kind: 'text' | 'image' | 'voice' }>;

/** Status's reactions are code points in hex, joined by dashes, without the emoji variation selector. */
export function reactionCode(emoji: string): string {
  return [...emoji]
    .map((char) => char.codePointAt(0)!.toString(16))
    .filter((code) => code !== 'fe0f')
    .join('-');
}

export function reactionEmoji(code: string): string {
  if (!/^[0-9a-f]+(-[0-9a-f]+)*$/i.test(code)) return code;
  const points = code.split('-').map((part) => parseInt(part, 16));
  if (points.some((point) => !Number.isFinite(point) || point > 0x10ffff)) return code;
  return emojiFromCodePoints(points);
}

function validClock(clock: number, wakuMs: number): boolean {
  return clock > 0 && clock <= wakuMs + MAX_CLOCK_DRIFT_MS;
}

function validChatMessage(message: WireChatMessage, wakuMs: number): boolean {
  if (!validClock(message.clock, wakuMs) || !message.timestamp || !message.chatId) return false;
  if (
    message.messageType !== MessageType.ONE_TO_ONE &&
    message.messageType !== MessageType.PRIVATE_GROUP
  ) {
    return false;
  }
  const textless =
    message.contentType === ContentType.IMAGE || message.contentType === ContentType.BRIDGE_MESSAGE;
  return textless || validText(message.text);
}

function validText(text: string): boolean {
  return text.trim().length > 0 && [...text].length <= MAX_TEXT_LENGTH;
}

function editedContent(content: MessageContent, text: string): MessageContent | null {
  if (content.kind === 'text') return { kind: 'text', text };
  if (content.kind === 'image') return { ...content, caption: text };
  return null;
}

/** status-go drops a message, contact update or identity whose name breaks these rules. */
function checkDisplayName(name: string): void {
  const length = [...name].length;
  const valid =
    length >= 5 &&
    length <= 24 &&
    /^[\p{L}\p{M}\p{N}_\-\s]+$/u.test(name) &&
    !/[._-]eth$/.test(name);
  if (name && !valid) {
    throw new Error(
      'A Status display name has 5 to 24 letters, digits, spaces, _ or -, and does not end in "eth".'
    );
  }
}

function imageMime(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42) return 'image/webp';
  return 'image/jpeg';
}

function consentOf(contact: ContactState): Consent {
  if (added(contact)) return 'accepted';
  if (dismissed(contact)) return 'declined';
  return contact.heardFrom || hasAddedUs(contact) ? 'request' : 'accepted';
}

function membershipUpdate(group: GroupState, message?: WireChatMessage): Uint8Array {
  return encodeMembershipUpdate({
    chatId: group.chatId,
    events: group.events.map((event) => event.bytes),
    message,
  });
}

async function remembered<T>(state: ProtocolState, key: string, create: () => T): Promise<T> {
  const saved = await state.get<T>(key);
  if (saved !== null) return saved;
  const value = create();
  await state.set(key, value);
  return value;
}

export class StatusSession implements ChatSession {
  readonly self: SelfParticipant;

  private readonly inbox: string[];
  private readonly chats = new Map<ProtocolChatId, TransportChat>();
  private readonly latest = new Map<ProtocolChatId, ProtocolMessage>();
  private readonly contacts = new Map<ParticipantId, ContactState>();
  private readonly groups = new Map<string, Group>();
  private readonly clocks = new Map<string, number>();
  private readonly deleted = new Map<MessageId, ParticipantId>();
  private readonly earlyEdits = new Map<string, PendingEdit>();
  private readonly messageListeners = new Set<(message: ProtocolMessage) => void>();
  private readonly chatListeners = new Set<(chat: ProtocolChat) => void>();
  private readonly deletionListeners = new Set<
    (id: ProtocolChatId, messageIds: MessageId[]) => void
  >();
  private readonly history = new HistoryTracker();
  private readonly acks = new Map<ParticipantId, Uint8Array[]>();
  private readonly seen = new Set<string>();
  private readonly pending = new Map<string, PendingSend>();
  private readonly ratchets: Ratchets;
  private readonly segments = new Reassembly();
  private work: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private polls = 0;
  private stopped = false;

  private constructor(
    private readonly identity: StatusIdentity,
    private readonly installationId: string,
    private readonly signedPreKey: SignedPreKey,
    private readonly node: WakuNode,
    private readonly store: MessageStore,
    private readonly state: ProtocolState,
    private readonly media: StatusMedia,
    private readonly displayName: string
  ) {
    this.ratchets = new Ratchets(identity, signedPreKey, new Map());
    this.self = { participantId: identity.participantId, address: chatKeyOf(identity.publicKey) };
    this.inbox = [partitionedTopic(identity.publicKey), personalTopic(identity.publicKey)];
  }

  static async connect(options: StatusConnectOptions): Promise<StatusSession> {
    const displayName = options.displayName?.trim() ?? '';
    checkDisplayName(displayName);
    const identity = identityFrom(options.derive);
    const installationId = await remembered(options.state, 'installation', () =>
      toHex(randomBytes(16))
    );
    const preKey = fromHex(
      await remembered(options.state, 'signedPreKey', () => toHex(randomPrivateKey()))
    );
    const signedPreKey = { privateKey: preKey, publicKey: publicKeyOf(preKey) };

    const node: WakuNode = options.nodeUrl?.trim()
      ? new StatusNode({ nodeUrl: options.nodeUrl, fetchImpl: options.fetchImpl })
      : await (await import('./fleet-node')).FleetNode.connect();
    try {
      await node.info();
      const session = new StatusSession(
        identity,
        installationId,
        signedPreKey,
        node,
        options.store,
        options.state,
        options.media,
        displayName
      );
      await session.hydrate();
      await node.subscribe(session.inbox);
      if (options.autoPoll !== false) session.schedulePoll();
      return session;
    } catch (error) {
      await node.close?.();
      throw error;
    }
  }

  private async hydrate(): Promise<void> {
    for (const [id, contact] of await this.state.entries<ContactState>('contact:')) {
      this.contacts.set(id, contact);
    }
    for (const [id, session] of await this.state.entries<RatchetSession>('ratchet:')) {
      this.ratchets.sessions.set(id, session);
    }
    for (const [id, clock] of await this.state.entries<number>('clock:')) {
      this.clocks.set(id, clock);
    }
    for (const [id, by] of await this.state.entries<ParticipantId>('deleted:')) {
      this.deleted.set(id, by);
    }
    for (const [key, edit] of await this.state.entries<PendingEdit>('edit:')) {
      this.earlyEdits.set(key, edit);
    }
    for (const [chatId, record] of await this.state.entries<GroupRecord>('group:')) {
      const events = record.events
        .map((bytes) => readGroupEvent(chatId, fromHex(bytes)))
        .filter((event): event is GroupEvent => event !== null);
      const state = GroupState.replay(chatId, events);
      if (state)
        this.groups.set(chatId, { state, consent: record.consent, picture: record.picture });
    }
    for (const chat of await this.store.loadChats<ProtocolChatId>(STATUS_PROTOCOL_ID)) {
      this.chats.set(chat.id, chat);
    }
    for (const [id, message] of await this.store.latestMessages<ProtocolChatId>(
      STATUS_PROTOCOL_ID
    )) {
      if (message.content.kind !== 'reaction') this.latest.set(id, message);
    }
  }

  private schedulePoll(): void {
    this.timer = setTimeout(() => {
      void this.pollOnce()
        .catch(() => {})
        .finally(() => {
          if (!this.stopped) this.schedulePoll();
        });
    }, POLL_INTERVAL_MS);
  }

  /** One round of the inbox: what the node relayed since the last one, then acknowledgements. */
  pollOnce(): Promise<void> {
    return this.serially(async () => {
      if (this.stopped) return;
      if (this.polls > 0 && this.polls % REFRESH_EVERY === 0) {
        await this.node.subscribe(this.inbox);
        await this.catchUp().catch((error) => console.warn('[status] catch-up failed', error));
      }
      this.polls += 1;
      for (const message of await this.node.poll()) await this.ingest(message);
      await this.flushAcks();
    });
  }

  private serially<T>(work: () => Promise<T>): Promise<T> {
    const result = this.work.then(work, work);
    this.work = result.catch(() => {});
    return result;
  }

  private async catchUp(): Promise<void> {
    const since = (await this.state.get<number>('synced')) ?? Date.now() - HISTORY_WINDOW_MS;
    const until = Date.now();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (;;) {
      if (this.stopped) return;
      const page = await this.node.history(this.inbox, {
        startTime: since - HISTORY_OVERLAP_MS,
        cursor,
      });
      for (const message of page.messages) await this.ingest(message);
      if (!page.cursor) break;
      if (cursors.has(page.cursor)) {
        throw new PartialHistoryError('The node kept returning the same history page; sync again');
      }
      cursors.add(page.cursor);
      cursor = page.cursor;
    }
    await this.state.set('synced', until);
  }

  private async ingest(message: WakuMessage): Promise<void> {
    if (this.stopped || !this.inbox.includes(message.contentTopic)) return;
    const fingerprint = toHex(sha256(message.payload));
    if (this.seen.has(fingerprint)) return;
    this.remember(fingerprint);

    const decoded = decodePayload(message.payload, { privateKey: this.identity.privateKey });
    if (!decoded) return;
    let data: Uint8Array | null = decoded.data;
    const part = readSegment(data);
    if (part) data = this.segments.add(decoded.signer, part);
    if (!data) return;

    const opened = openData(
      this.identity,
      this.installationId,
      decoded.signer,
      data,
      this.ratchets
    );
    for (const [id, session] of this.ratchets.takeChanged()) {
      await this.state.set(`ratchet:${id}`, session);
    }
    if (!opened) return;
    const sender = participantIdOf(opened.signer);
    const wakuMs = message.timestamp || Date.now();

    for (const record of opened.records) {
      if (record.sync) this.queueAck(sender, syncMessageId(record.sync));
      const application = readApplication(record.body);
      if (!application) continue;
      try {
        await this.handle(application, wakuMs);
      } catch (error) {
        console.warn('[status] could not handle a message', error);
      }
    }
  }

  private remember(fingerprint: string): void {
    this.seen.add(fingerprint);
    if (this.seen.size <= SEEN_LIMIT) return;
    const oldest = this.seen.values().next().value;
    if (oldest !== undefined) this.seen.delete(oldest);
  }

  private queueAck(sender: ParticipantId, id: Uint8Array): void {
    const list = this.acks.get(sender);
    if (list) list.push(id);
    else this.acks.set(sender, [id]);
  }

  private async flushAcks(): Promise<void> {
    const batches = [...this.acks];
    this.acks.clear();
    await Promise.allSettled(
      batches.map(([sender, ids]) => this.publishTo(sender, encodeMvds({ acks: ids })))
    );
  }

  private async handle(message: ApplicationMessage, wakuMs: number): Promise<void> {
    const author = participantIdOf(message.signer);
    if (author === this.self.participantId) return;
    switch (message.type) {
      case AppType.CHAT_MESSAGE:
        return this.onChatMessage(message, decodeChatMessage(message.payload), wakuMs, author);
      case AppType.EMOJI_REACTION:
        return this.onReaction(message, decodeReaction(message.payload), wakuMs, author);
      case AppType.MEMBERSHIP_UPDATE_MESSAGE:
        return this.onMembershipUpdate(message, wakuMs, author);
      case AppType.EDIT_MESSAGE:
        return this.onEdit(decodeEdit(message.payload), author);
      case AppType.DELETE_MESSAGE:
        return this.onDelete(decodeDelete(message.payload), author);
      case AppType.CONTACT_UPDATE:
        return this.onContactUpdate(author, message);
      case AppType.ACCEPT_CONTACT_REQUEST: {
        const { clock } = decodeContactRequestDecision(message.payload);
        await this.updateContact(author, (contact) => requestReceived(contact, clock));
        return;
      }
      case AppType.RETRACT_CONTACT_REQUEST: {
        const { clock } = decodeContactRequestDecision(message.payload);
        await this.updateContact(author, (contact) => remoteRetracted(contact, clock));
        return;
      }
      case AppType.CHAT_IDENTITY:
        return this.onChatIdentity(author, decodeChatIdentity(message.payload));
    }
  }

  private contact(id: ParticipantId): ContactState {
    return this.contacts.get(id) ?? NEW_CONTACT;
  }

  private async saveContact(id: ParticipantId, contact: ContactState): Promise<void> {
    this.contacts.set(id, contact);
    await this.state.set(`contact:${id}`, contact);
  }

  private async updateContact(
    id: ParticipantId,
    change: (contact: ContactState) => ContactChange
  ): Promise<ContactChange> {
    const before = this.contact(id);
    const result = change(before);
    if (result.contact !== before) {
      await this.saveContact(id, result.contact);
      if (consentOf(before) !== consentOf(result.contact) || result.newRequest) {
        await this.announceDm(id);
      }
    }
    if (result.sendBackState) await this.sendContactUpdate(id).catch(() => {});
    return result;
  }

  private async updateDisplayName(id: ParticipantId, name: string): Promise<void> {
    const contact = this.contact(id);
    if (!name || contact.displayName === name) return;
    await this.saveContact(id, { ...contact, displayName: name });
    this.refreshDm(id);
  }

  private async onChatIdentity(author: ParticipantId, identity: WireChatIdentity): Promise<void> {
    const contact = this.contact(author);
    if (!identity.clock || (contact.identityClock ?? 0) >= identity.clock) return;
    const image = this.pictureOf(author, identity.images);
    await this.saveContact(author, {
      ...contact,
      displayName: identity.displayName || contact.displayName,
      picture: image && (await this.savePicture(image.payload, IMAGE_FORMATS[image.format])),
      identityClock: identity.clock,
    });
    this.refreshDm(author);
  }

  /** status-go sends a large picture and a thumbnail, encrypted for its contacts unless shown to everyone. */
  private pictureOf(
    author: ParticipantId,
    images: WireIdentityImage[]
  ): WireIdentityImage | undefined {
    const shared = sharedSecret(this.identity.privateKey, publicKeyFromParticipant(author));
    const largeFirst = [...images].sort(
      (a, b) => Number(b.name === 'large') - Number(a.name === 'large')
    );
    for (const image of largeFirst) {
      if (!image.encrypted) {
        if (image.payload.length) return image;
        continue;
      }
      for (const key of image.encryptionKeys) {
        try {
          return {
            ...image,
            payload: decryptNonceFirst(decryptNonceFirst(shared, key), image.payload),
          };
        } catch {}
      }
    }
    return undefined;
  }

  private savePicture(bytes: Uint8Array, mimeType = imageMime(bytes)): Promise<string> {
    return this.media.save(`picture-${toHex(sha256(bytes)).slice(0, 32)}`, bytes, mimeType);
  }

  private async onContactUpdate(author: ParticipantId, message: ApplicationMessage): Promise<void> {
    const update = decodeContactUpdate(message.payload);
    if (update.contactRequestState) {
      const state = update.contactRequestState;
      await this.updateContact(author, (contact) => propagatedStateReceived(contact, state));
    }
    const contact = this.contact(author);
    if (contact.updatedAt >= update.clock) return;
    await this.saveContact(author, {
      ...contact,
      displayName: update.displayName || contact.displayName,
      updatedAt: update.clock,
    });
    await this.updateContact(author, (current) =>
      requestReceived(current, update.contactRequestClock)
    );
    this.refreshDm(author);
  }

  private async onChatMessage(
    message: ApplicationMessage,
    chat: WireChatMessage,
    wakuMs: number,
    author: ParticipantId,
    group?: GroupState
  ): Promise<void> {
    if (!validChatMessage(chat, wakuMs)) return;

    if (chat.messageType === MessageType.PRIVATE_GROUP) {
      const known = group ?? this.groups.get(chat.chatId)?.state;
      if (!known || known.chatId !== chat.chatId || !this.bothMembers(known, author)) return;
      await this.deliver(protocolChatId(chat.chatId), message.id, author, chat);
      return;
    }

    if (chat.contactRequestState) {
      const state = chat.contactRequestState;
      await this.updateContact(author, (contact) => propagatedStateReceived(contact, state));
    }
    if (dismissed(this.contact(author))) return;
    if (chat.contentType === ContentType.CONTACT_REQUEST) {
      const result = await this.updateContact(author, (contact) =>
        requestReceived(contact, chat.clock)
      );
      if (result.processed) {
        await this.saveContact(author, { ...this.contact(author), requestId: message.id });
      }
    }
    if (chat.displayName) await this.updateDisplayName(author, chat.displayName);
    if (!this.contact(author).heardFrom) {
      await this.saveContact(author, { ...this.contact(author), heardFrom: true });
    }
    await this.deliver(protocolChatId(author), message.id, author, chat);
  }

  private bothMembers(group: GroupState, author: ParticipantId): boolean {
    return group.members.has(author) && group.members.has(this.self.participantId);
  }

  private async deliver(
    chatId: ProtocolChatId,
    id: MessageId,
    author: ParticipantId,
    chat: WireChatMessage
  ): Promise<void> {
    const deletedBy = this.deleted.get(id);
    if (
      deletedBy &&
      (deletedBy === this.self.participantId ||
        this.mayDelete(deletedBy, { chatId, senderId: author }))
    ) {
      return;
    }
    const content = await this.contentOf(id, chat);
    if (!content) return;
    await this.observeClock(chatId, chat.clock);
    const message: ProtocolMessage = {
      id,
      chatId,
      senderId: author,
      sentAt: chat.timestamp,
      content,
      fromMe: false,
      status: 'sent',
      replyTo: chat.responseTo || undefined,
    };
    await this.insert(message);

    const key = `${id}:${author}`;
    const edit = this.earlyEdits.get(key);
    if (!edit) return;
    this.earlyEdits.delete(key);
    await this.state.remove(`edit:${key}`);
    if (edit.clock >= chat.clock) await this.applyEdit(message, edit.clock, edit.text);
  }

  /** Edits and deletions name a message by id; it lives in the sender's DM or in the group. */
  private chatOf(
    messageType: number,
    chatId: string,
    sender: ParticipantId
  ): ProtocolChatId | null {
    if (messageType === MessageType.ONE_TO_ONE) return protocolChatId(sender);
    if (messageType === MessageType.PRIVATE_GROUP && this.groups.has(chatId)) {
      return protocolChatId(chatId);
    }
    return null;
  }

  /** An edit that beats its message here waits for it, as status-go does. */
  private async onEdit(edit: WireEdit, author: ParticipantId): Promise<void> {
    if (!edit.clock || !edit.chatId || !edit.messageId || !validText(edit.text)) return;
    const chatId = this.chatOf(edit.messageType, edit.chatId, author);
    if (!chatId) return;
    const text = this.readText(edit.text);
    const original = await this.store.getMessage(chatId, edit.messageId);
    if (original) {
      if (original.senderId === author) await this.applyEdit(original, edit.clock, text);
      return;
    }
    const key = `${edit.messageId}:${author}`;
    if ((this.earlyEdits.get(key)?.clock ?? 0) >= edit.clock) return;
    const early: PendingEdit = { clock: edit.clock, text };
    this.earlyEdits.set(key, early);
    await this.state.set(`edit:${key}`, early);
  }

  private async applyEdit(original: ProtocolMessage, clock: number, text: string): Promise<void> {
    const key = `edited:${original.id}`;
    const content = editedContent(original.content, text);
    if (!content || ((await this.state.get<number>(key)) ?? 0) >= clock) return;
    await this.state.set(key, clock);
    const edited: ProtocolMessage = { ...original, content, edited: true };
    await this.store.updateMessage(edited);
    if (this.latest.get(edited.chatId)?.id === edited.id) this.latest.set(edited.chatId, edited);
    for (const listener of this.messageListeners) listener(edited);
  }

  private async onDelete(deletion: WireDelete, by: ParticipantId): Promise<void> {
    if (!deletion.chatId || !deletion.messageId) return;
    const chatId = this.chatOf(deletion.messageType, deletion.chatId, by);
    if (!chatId) return;
    const message = await this.store.getMessage(chatId, deletion.messageId);
    if (message) {
      if (this.mayDelete(by, message)) await this.removeMessage(message, by);
      return;
    }
    if (!this.deleted.has(deletion.messageId)) await this.tombstone(deletion.messageId, by);
  }

  private mayDelete(
    by: ParticipantId,
    message: Pick<ProtocolMessage, 'chatId' | 'senderId'>
  ): boolean {
    return by === message.senderId || !!this.groups.get(message.chatId)?.state.admins.has(by);
  }

  /** The tombstone keeps a message away when the network delivers it again. */
  private async tombstone(id: MessageId, by: ParticipantId): Promise<void> {
    this.deleted.set(id, by);
    await this.state.set(`deleted:${id}`, by);
  }

  private async removeMessage(message: ProtocolMessage, by: ParticipantId): Promise<void> {
    await this.tombstone(message.id, by);
    await this.store.deleteMessages(message.chatId, [message.id]);
    for (const listener of this.deletionListeners) listener(message.chatId, [message.id]);
    if (this.latest.get(message.chatId)?.id !== message.id) return;
    const rest = await this.store.loadMessages(message.chatId);
    const newest = rest.filter((m) => m.content.kind !== 'reaction').at(-1);
    if (newest) this.latest.set(message.chatId, newest);
    else this.latest.delete(message.chatId);
    const chat = this.chats.get(message.chatId);
    if (chat) this.announce(chat);
  }

  private knownName(id: ParticipantId): string | undefined {
    return id === this.self.participantId ? this.displayName : this.contacts.get(id)?.displayName;
  }

  private nameOf(id: ParticipantId): string {
    return this.knownName(id) || shortAddress(chatKeyOf(id));
  }

  private readText(text: string): string {
    return fromStatusMentions(text, (id) => this.nameOf(id));
  }

  private async contentOf(id: MessageId, chat: WireChatMessage): Promise<MessageContent | null> {
    switch (chat.contentType) {
      case ContentType.TEXT_PLAIN:
      case ContentType.EMOJI:
      case ContentType.CONTACT_REQUEST:
        return { kind: 'text', text: this.readText(chat.text) };
      case ContentType.BRIDGE_MESSAGE:
        return chat.bridge
          ? { kind: 'text', text: `${chat.bridge.userName}: ${chat.bridge.content}` }
          : null;
      case ContentType.IMAGE: {
        if (!chat.image?.payload.length) return null;
        const mimeType = IMAGE_FORMATS[chat.image.format] ?? 'image/jpeg';
        return {
          kind: 'image',
          uri: await this.media.save(id, chat.image.payload, mimeType),
          width: chat.image.width || undefined,
          height: chat.image.height || undefined,
          size: chat.image.payload.length,
          mimeType,
          caption: this.readText(chat.text).trim() || undefined,
        };
      }
      case ContentType.AUDIO:
        if (chat.audio?.type !== AudioType.AAC || !chat.audio.payload.length) {
          return { kind: 'unsupported', typeId: 'status/audio', fallback: 'Voice message' };
        }
        return {
          kind: 'voice',
          uri: await this.media.save(id, chat.audio.payload, 'audio/aac'),
          durationMs: chat.audio.durationMs,
          size: chat.audio.payload.length,
          mimeType: 'audio/aac',
        };
      case ContentType.STICKER:
        return { kind: 'unsupported', typeId: 'status/sticker', fallback: 'Sticker' };
      default:
        return chat.text.trim() ? { kind: 'text', text: this.readText(chat.text) } : null;
    }
  }

  private async onReaction(
    message: ApplicationMessage,
    reaction: WireReaction,
    wakuMs: number,
    author: ParticipantId
  ): Promise<void> {
    if (!validClock(reaction.clock, wakuMs) || !reaction.messageId || !reaction.chatId) return;
    const code = reaction.emoji || LEGACY_REACTIONS[reaction.legacyType];
    const chatId = this.chatOf(reaction.messageType, reaction.chatId, author);
    if (!code || !chatId) return;
    const group = this.groups.get(chatId)?.state;
    if (group && !this.bothMembers(group, author)) return;
    await this.observeClock(chatId, reaction.clock);
    await this.insert({
      id: message.id,
      chatId,
      senderId: author,
      sentAt: reaction.clock,
      content: {
        kind: 'reaction',
        targetId: reaction.messageId,
        emoji: reactionEmoji(code),
        action: reaction.retracted ? 'removed' : 'added',
      },
      fromMe: false,
      status: 'sent',
    });
  }

  private async onMembershipUpdate(
    message: ApplicationMessage,
    wakuMs: number,
    author: ParticipantId
  ): Promise<void> {
    const update = decodeMembershipUpdate(message.payload);
    const known = this.groups.get(update.chatId);
    const fresh: GroupEvent[] = [];
    for (const bytes of update.events) {
      if (known?.state.has(bytes)) continue;
      const event = readGroupEvent(update.chatId, bytes);
      if (!event || !validClock(event.clock, wakuMs)) return;
      fresh.push(event);
    }

    const me = this.self.participantId;
    let group: GroupState | null;
    let consent: Consent;
    if (known) {
      group = known.state.merged(fresh);
      if (!group) return;
      const readded = !known.state.members.has(me) && group.members.has(me);
      consent = readded && this.trusts(author, group) ? 'accepted' : known.consent;
    } else {
      group = GroupState.replay(update.chatId, fresh);
      if (!group?.wasEverMember(me)) return;
      consent = this.trusts(author, group) ? 'accepted' : 'request';
    }

    if (group !== known?.state || consent !== known?.consent) {
      await this.saveGroup(group, consent);
      if (consent === 'accepted' && known?.consent !== 'accepted' && group.members.has(me)) {
        await this.joinGroup(group).catch(() => {});
      }
    }

    if (update.message) {
      await this.onChatMessage(message, update.message, wakuMs, author, group);
    } else if (update.reaction) {
      await this.onReaction(message, update.reaction, wakuMs, author);
    }
  }

  /** status-go shows a group straight away when someone you added adds you, or its creator is a mutual contact. */
  private trusts(author: ParticipantId, group: GroupState): boolean {
    const creator = group.creator;
    return added(this.contact(author)) || (creator !== undefined && mutual(this.contact(creator)));
  }

  private async saveGroup(group: GroupState, consent: Consent): Promise<void> {
    const known = this.groups.get(group.chatId);
    const picture =
      known && known.state.image === group.image
        ? known.picture
        : group.image && (await this.savePicture(group.image));
    this.groups.set(group.chatId, { state: group, consent, picture });
    await this.state.set<GroupRecord>(`group:${group.chatId}`, {
      events: group.events.map((event) => toHex(event.bytes)),
      consent,
      picture,
    });
    const id = protocolChatId(group.chatId);
    const chat: TransportChat = {
      id,
      protocolId: STATUS_PROTOCOL_ID,
      participants: [...group.members].sort(),
      title: group.name,
      createdAt: this.chats.get(id)?.createdAt ?? group.events[0]?.clock ?? Date.now(),
      hidden: consent === 'declined',
    };
    await this.saveChat(chat);
    this.announce(chat);
  }

  private async observeClock(chatId: string, clock: number): Promise<void> {
    if ((this.clocks.get(chatId) ?? 0) >= clock) return;
    this.clocks.set(chatId, clock);
    await this.state.set(`clock:${chatId}`, clock);
  }

  private async nextClock(chatId: string): Promise<{ clock: number; timestamp: number }> {
    const timestamp = Date.now();
    const last = this.clocks.get(chatId) ?? 0;
    const clock = last < timestamp ? timestamp : last + 1;
    this.clocks.set(chatId, clock);
    await this.state.set(`clock:${chatId}`, clock);
    return { clock, timestamp };
  }

  private async insert(message: ProtocolMessage): Promise<void> {
    const existing = this.chats.get(message.chatId);
    const chat = existing ?? this.newDmChat(message.chatId);
    const shown = chat.hidden && !this.groups.has(chat.id) ? { ...chat, hidden: false } : chat;
    const changed = shown !== existing;
    const inserted = await this.store.insertMessage(message, changed ? shown : undefined);
    if (changed) this.chats.set(shown.id, shown);
    if (!inserted) return;
    const previous = this.latest.get(shown.id);
    const newer =
      message.content.kind !== 'reaction' && (!previous || previous.sentAt <= message.sentAt);
    if (newer) this.latest.set(shown.id, message);
    for (const listener of this.messageListeners) listener(message);
    if (changed || newer) this.announce(shown);
  }

  private newDmChat(id: ProtocolChatId): TransportChat {
    return {
      id,
      protocolId: STATUS_PROTOCOL_ID,
      participants: [this.self.participantId, id].sort(),
      createdAt: Date.now(),
      hidden: false,
    };
  }

  private async saveChat(chat: TransportChat): Promise<void> {
    await this.store.upsertChat(chat);
    this.chats.set(chat.id, chat);
  }

  private async announceDm(peer: ParticipantId): Promise<void> {
    const id = protocolChatId(peer);
    let chat = this.chats.get(id);
    if (!chat) {
      chat = this.newDmChat(id);
      await this.saveChat(chat);
    }
    this.announce(chat);
  }

  private refreshDm(peer: ParticipantId): void {
    const chat = this.chats.get(protocolChatId(peer));
    if (chat) this.announce(chat);
  }

  private announce(chat: TransportChat): void {
    if (chat.hidden) return;
    const projected = this.toChat(chat);
    for (const listener of this.chatListeners) listener(projected);
  }

  private toChat(chat: TransportChat): ProtocolChat {
    const lastMessage = this.latest.get(chat.id);
    const group = this.groups.get(chat.id);
    if (group) {
      const me = this.self.participantId;
      return {
        id: chat.id,
        kind: 'group',
        title: group.state.name,
        memberIds: [...group.state.members],
        createdAt: chat.createdAt,
        lastMessage,
        consent: group.consent,
        canSend: group.state.members.has(me),
        selfRole: group.state.roleOf(me),
        canDeleteOthers: group.state.admins.has(me),
        avatarUri: group.picture,
      };
    }
    const contact = this.contact(chat.id);
    return {
      id: chat.id,
      kind: 'dm',
      title: contact.displayName || chat.id,
      memberIds: chat.participants,
      createdAt: chat.createdAt,
      lastMessage,
      consent: consentOf(contact),
      avatarUri: contact.picture,
    };
  }

  private requireGroup(id: ProtocolChatId): Group {
    const group = this.groups.get(id);
    if (!group) throw new Error('That only works in a group.');
    return group;
  }

  private messageTypeOf(chatId: ProtocolChatId): number {
    return this.groups.has(chatId) ? MessageType.PRIVATE_GROUP : MessageType.ONE_TO_ONE;
  }

  /** Signed afresh each time: peers keep the three devices they heard from last. */
  private bundle(): Uint8Array {
    return signedBundle(
      this.identity,
      this.installationId,
      compressPublicKey(this.signedPreKey.publicKey),
      BigInt(Date.now()) * 1_000_000n
    );
  }

  private async publishTo(
    recipient: ParticipantId,
    plaintext: Uint8Array,
    bundle = this.bundle()
  ): Promise<void> {
    const publicKey = publicKeyFromParticipant(recipient);
    const topic = partitionedTopic(publicKey);
    const parts = sealEnvelope(this.identity, this.installationId, publicKey, plaintext, bundle);
    for (const part of parts) await this.node.publish(topic, part);
  }

  private dataSync(recipient: ParticipantId, application: Uint8Array): Uint8Array {
    const record = syncRecord(
      this.identity.publicKey,
      publicKeyFromParticipant(recipient),
      application,
      Math.floor(Date.now() / 1_000)
    );
    return encodeMvds({ messages: [record] });
  }

  private async publishAll(
    recipients: ParticipantId[],
    application: Uint8Array,
    synced: boolean,
    onSent?: (recipient: ParticipantId) => void
  ): Promise<void> {
    const bundle = this.bundle();
    const results = await Promise.allSettled(
      recipients.map(async (recipient) => {
        const plaintext = synced ? this.dataSync(recipient, application) : application;
        await this.publishTo(recipient, plaintext, bundle);
        onSent?.(recipient);
      })
    );
    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    if (failure) throw failure.reason;
  }

  private async sendTo(
    recipients: Iterable<ParticipantId>,
    type: number,
    payload: Uint8Array,
    synced = true
  ): Promise<void> {
    const { bytes } = wrapApplication(type, payload, this.identity);
    await this.publishAll(this.others(recipients), bytes, synced);
  }

  private others(recipients: Iterable<ParticipantId>): ParticipantId[] {
    return [...new Set(recipients)].filter((id) => id !== this.self.participantId);
  }

  /** One message to every recipient; a retry after a partial failure only sends to the ones it missed. */
  private async post(
    key: string,
    build: () => Promise<Outgoing>,
    recipients: ParticipantId[],
    synced = true
  ): Promise<ProtocolMessage> {
    let pending = this.pending.get(key);
    if (!pending) {
      const built = await build();
      const wrapped = wrapApplication(built.type, built.payload, this.identity);
      pending = {
        message: { ...built.message, id: wrapped.id },
        remaining: new Set(this.others(recipients)),
        payload: wrapped.bytes,
      };
      this.pending.set(key, pending);
    }
    const { remaining } = pending;
    await this.publishAll([...remaining], pending.payload, synced, (recipient) =>
      remaining.delete(recipient)
    );
    this.pending.delete(key);
    return pending.message;
  }

  private recipientsOf(chatId: ProtocolChatId): ParticipantId[] {
    const group = this.groups.get(chatId);
    return group ? [...group.state.members] : [chatId];
  }

  private async groupUpdate(group: GroupState, recipients: Iterable<ParticipantId>): Promise<void> {
    await this.sendTo(recipients, AppType.MEMBERSHIP_UPDATE_MESSAGE, membershipUpdate(group));
  }

  private async changeGroup(
    id: ProtocolChatId,
    changes: GroupChange[],
    alsoTell: ParticipantId[] = []
  ): Promise<void> {
    const group = this.requireGroup(id);
    const start = Math.max(group.state.lastClock + 1, (await this.nextClock(id)).clock);
    const next = group.state.merged(
      signGroupEvents(group.state.chatId, start, changes, this.identity)
    );
    if (!next)
      throw new Error('Status would refuse that change: only admins remove other members.');
    await this.saveGroup(next, group.consent);
    await this.groupUpdate(next, [...group.state.members, ...next.members, ...alsoTell]);
  }

  private async joinGroup(group: GroupState): Promise<void> {
    const joined = group.events.some(
      (event) => event.type === EventType.MEMBER_JOINED && event.from === this.self.participantId
    );
    if (joined) return;
    await this.changeGroup(protocolChatId(group.chatId), [{ type: EventType.MEMBER_JOINED }]);
  }

  private async sendContactUpdate(peer: ParticipantId): Promise<void> {
    const contact = this.contact(peer);
    if (!added(contact)) return;
    const { clock } = await this.nextClock(peer);
    const payload = encodeContactUpdate({
      clock,
      displayName: this.displayName,
      contactRequestClock: contact.localClock,
      contactRequestState: propagatedState(contact),
      publicKey: peer,
    });
    await this.sendTo([peer], AppType.CONTACT_UPDATE, payload);
  }

  private outgoing(
    chatId: ProtocolChatId,
    sentAt: number,
    content: MessageContent,
    replyTo?: MessageId
  ): Omit<ProtocolMessage, 'id'> {
    return {
      chatId,
      senderId: this.self.participantId,
      sentAt,
      content,
      fromMe: true,
      status: 'sent',
      replyTo,
    };
  }

  private async chatMessage(
    chatId: ProtocolChatId,
    content: Sendable,
    replyTo?: MessageId,
    contentType?: number
  ): Promise<Outgoing> {
    const group = this.groups.get(chatId);
    const { clock, timestamp } = await this.nextClock(chatId);
    const body = await this.wireContent(content);
    const wire: WireChatMessage = {
      ...body,
      clock,
      timestamp,
      responseTo: replyTo ?? '',
      chatId,
      messageType: group ? MessageType.PRIVATE_GROUP : MessageType.ONE_TO_ONE,
      contentType: contentType ?? body.contentType,
      displayName: this.displayName,
      contactRequestState: group ? undefined : propagatedState(this.contact(chatId)),
    };
    const message = this.outgoing(chatId, timestamp, content, replyTo);
    return group
      ? {
          type: AppType.MEMBERSHIP_UPDATE_MESSAGE,
          payload: membershipUpdate(group.state, wire),
          message,
        }
      : { type: AppType.CHAT_MESSAGE, payload: encodeChatMessage(wire), message };
  }

  private async wireContent(
    content: Sendable
  ): Promise<Pick<WireChatMessage, 'contentType' | 'text' | 'image' | 'audio'>> {
    switch (content.kind) {
      case 'text':
        return { contentType: ContentType.TEXT_PLAIN, text: toStatusMentions(content.text) };
      case 'image':
        return {
          contentType: ContentType.IMAGE,
          text: toStatusMentions(content.caption ?? ''),
          image: await this.imageOf(content),
        };
      case 'voice':
        return {
          contentType: ContentType.AUDIO,
          text: VOICE_TEXT,
          audio: await this.audioOf(content),
        };
    }
  }

  private async imageOf(content: Extract<MessageContent, { kind: 'image' }>) {
    const mimeType = content.mimeType ?? 'image/jpeg';
    const format = Number(
      Object.entries(IMAGE_FORMATS).find(([, type]) => type === mimeType)?.[0] ?? 2
    );
    return {
      payload: await this.media.load(content.uri, content.name ?? 'image', mimeType),
      format,
      width: content.width ?? 0,
      height: content.height ?? 0,
    };
  }

  private async audioOf(content: Extract<MessageContent, { kind: 'voice' }>) {
    const recording = await this.media.load(
      content.uri,
      content.name ?? 'voice',
      content.mimeType ?? 'audio/mp4'
    );
    const audio = statusAudio(recording);
    if (!audio) throw new Error('Status plays voice notes in AAC or AMR, and this one is neither.');
    return { ...audio, durationMs: content.durationMs };
  }

  private async reaction(
    chatId: ProtocolChatId,
    content: Extract<MessageContent, { kind: 'reaction' }>
  ): Promise<Outgoing> {
    const { clock } = await this.nextClock(chatId);
    const code = reactionCode(content.emoji);
    const legacy = Object.entries(LEGACY_REACTIONS).find(([, value]) => value === code);
    return {
      type: AppType.EMOJI_REACTION,
      payload: encodeReaction({
        clock,
        chatId,
        messageId: content.targetId,
        messageType: this.messageTypeOf(chatId),
        emoji: code,
        legacyType: legacy ? Number(legacy[0]) : 0,
        retracted: content.action === 'removed',
      }),
      message: this.outgoing(chatId, clock, content),
    };
  }

  /**
   * Sent apart from the message itself: status-go drops a contact request from
   * someone it already counts as mutual, which a key brought over from the
   * Status app often is.
   */
  private async requestContact(peer: ProtocolChatId): Promise<Outgoing> {
    const { clock } = await this.nextClock(peer);
    await this.saveContact(peer, requestSent(this.contact(peer), clock).contact);
    return this.chatMessage(
      peer,
      { kind: 'text', text: REQUEST_TEXT },
      undefined,
      ContentType.CONTACT_REQUEST
    );
  }

  async send(id: ProtocolChatId, content: MessageContent, replyTo?: MessageId): Promise<MessageId> {
    if (!this.chats.has(id)) throw new Error(`Chat ${id} not found`);
    const group = this.groups.get(id);
    if (group && !group.state.members.has(this.self.participantId)) {
      throw new Error('You are no longer a member of this group.');
    }
    const recipients = this.recipientsOf(id);
    const key = `${id}\n${JSON.stringify(content)}\n${replyTo ?? ''}`;
    let message: ProtocolMessage;
    if (content.kind === 'reaction') {
      message = await this.post(key, () => this.reaction(id, content), recipients, false);
    } else if (content.kind === 'text' || content.kind === 'image' || content.kind === 'voice') {
      if (!group && !added(this.contact(id))) {
        await this.post(`${key}\nrequest`, () => this.requestContact(id), recipients);
      }
      message = await this.post(
        `${key}\nmessage`,
        () => this.chatMessage(id, content, replyTo),
        recipients
      );
    } else {
      throw new Error(`Status cannot send ${content.kind} messages yet.`);
    }
    await this.insert(message);
    return message.id;
  }

  async setConsent(id: ProtocolChatId, consent: ConsentDecision): Promise<void> {
    const group = this.groups.get(id);
    if (group) {
      await this.saveGroup(group.state, consent);
      if (consent === 'accepted') await this.joinGroup(group.state);
      return;
    }
    const { clock } = await this.nextClock(id);
    if (consent === 'declined') {
      await this.updateContact(id, (contact) => requestDismissed(contact, clock));
      const chat = this.chats.get(id);
      if (chat) await this.saveChat({ ...chat, hidden: true });
      return;
    }
    const contact = this.contact(id);
    await this.updateContact(id, (current) => requestSent(current, clock));
    const payload = encodeContactRequestDecision({ id: contact.requestId ?? '', clock });
    await this.sendTo([id], AppType.ACCEPT_CONTACT_REQUEST, payload);
    if (this.displayName) {
      const identity = encodeChatIdentity({ clock: Date.now(), displayName: this.displayName });
      await this.sendTo([id], AppType.CHAT_IDENTITY, identity, false);
    }
  }

  async editMessage(id: ProtocolChatId, messageId: MessageId, text: string): Promise<void> {
    const original = await this.store.getMessage(id, messageId);
    if (!original?.fromMe || !editedContent(original.content, text)) {
      throw new Error('Status only edits the text of your own messages.');
    }
    const wireText = toStatusMentions(text);
    if (!validText(wireText)) throw new Error('An edit needs text, up to 4096 characters.');
    const { clock } = await this.nextClock(id);
    const payload = encodeEdit({
      clock,
      text: wireText,
      chatId: id,
      messageId,
      messageType: this.messageTypeOf(id),
      contentType: original.content.kind === 'image' ? ContentType.IMAGE : ContentType.TEXT_PLAIN,
    });
    await this.sendTo(this.recipientsOf(id), AppType.EDIT_MESSAGE, payload);
    await this.applyEdit(original, clock, text);
  }

  async deleteMessage(id: ProtocolChatId, messageId: MessageId): Promise<void> {
    const message = await this.store.getMessage(id, messageId);
    if (!message) return;
    const me = this.self.participantId;
    if (!this.mayDelete(me, message)) {
      throw new Error('Only group admins can delete what others wrote.');
    }
    const { clock } = await this.nextClock(id);
    const payload = encodeDelete({
      clock,
      chatId: id,
      messageId,
      messageType: this.messageTypeOf(id),
      deletedBy: message.fromMe ? '' : me,
    });
    await this.sendTo(this.recipientsOf(id), AppType.DELETE_MESSAGE, payload);
    await this.removeMessage(message, me);
  }

  async deleteMessageForMe(id: ProtocolChatId, messageId: MessageId): Promise<void> {
    const message = await this.store.getMessage(id, messageId);
    if (message) await this.removeMessage(message, this.self.participantId);
  }

  async listChats(): Promise<ProtocolChat[]> {
    return [...this.chats.values()].filter((chat) => !chat.hidden).map((chat) => this.toChat(chat));
  }

  async whenListed(first: ProtocolChat[]): Promise<ProtocolChat[]> {
    return first;
  }

  async getMessages(
    id: ProtocolChatId,
    opts?: { limit?: number; before?: { sentAt: number; id: MessageId } }
  ): Promise<ProtocolMessage[]> {
    if (!this.chats.has(id)) return [];
    return this.store.loadMessages(id, opts?.limit, opts?.before);
  }

  countUnread(id: ProtocolChatId, since: number): Promise<number> {
    return this.store.countUnreadMessages(id, since);
  }

  async resolveParticipant(addressOrId: string): Promise<ParticipantId | null> {
    return parseChatKey(addressOrId);
  }

  async resolveAddresses(ids: ParticipantId[]): Promise<Record<ParticipantId, string>> {
    const out: Record<ParticipantId, string> = {};
    for (const id of ids) {
      try {
        out[id] = chatKeyOf(id);
      } catch {}
    }
    return out;
  }

  async mentionCandidates(id: ProtocolChatId, query: string): Promise<MentionCandidate[]> {
    const needle = query.toLowerCase();
    return this.recipientsOf(id)
      .filter((member) => member !== this.self.participantId)
      .map((member) => ({ id: member, name: this.nameOf(member) }))
      .filter(
        ({ id: member, name }) =>
          name.toLowerCase().includes(needle) || chatKeyOf(member).toLowerCase().includes(needle)
      )
      .slice(0, 20);
  }

  async resolveNames(ids: ParticipantId[]): Promise<Record<ParticipantId, string>> {
    const out: Record<ParticipantId, string> = {};
    for (const id of ids) {
      const name = this.knownName(id);
      if (name) out[id] = name;
    }
    return out;
  }

  async createDm(participant: ParticipantId): Promise<ProtocolChat> {
    publicKeyFromParticipant(participant);
    if (participant === this.self.participantId) throw new Error('That is your own chat key.');
    const id = protocolChatId(participant);
    const existing = this.chats.get(id);
    const chat = existing ? { ...existing, hidden: false } : this.newDmChat(id);
    await this.saveChat(chat);
    return this.toChat(chat);
  }

  async createGroup(participants: ParticipantId[], title: string): Promise<ProtocolChat> {
    const members = [...new Set(participants)].filter((id) => id !== this.self.participantId);
    for (const member of members) publicKeyFromParticipant(member);
    const strangers = members.filter((member) => !mutual(this.contact(member)));
    if (strangers.length > 0) {
      throw new Error(
        'Status only lets you add contacts who accepted your contact request. ' +
          `Start a DM with ${strangers.map((id) => chatKeyOf(id)).join(', ')} first.`
      );
    }
    const chatId = newGroupChatId(this.self.participantId);
    const { clock } = await this.nextClock(chatId);
    const changes: GroupChange[] = [
      { type: EventType.CHAT_CREATED, name: title.trim() || 'Group', color: GROUP_COLOR },
    ];
    if (members.length > 0) changes.push({ type: EventType.MEMBERS_ADDED, members });
    const group = GroupState.replay(chatId, signGroupEvents(chatId, clock, changes, this.identity));
    if (!group) throw new Error('Could not create the group.');
    await this.saveGroup(group, 'accepted');
    await this.groupUpdate(group, group.members);
    return this.toChat(this.chats.get(protocolChatId(chatId))!);
  }

  async getGroupInfo(id: ProtocolChatId): Promise<GroupInfo> {
    const group = this.requireGroup(id);
    return { avatarUri: group.picture, memberCount: group.state.members.size };
  }

  async getMembers(id: ProtocolChatId): Promise<GroupMember[]> {
    const { state } = this.requireGroup(id);
    return [...state.members].map((member) => ({ id: member, role: state.roleOf(member) }));
  }

  async addMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void> {
    const { state } = this.requireGroup(id);
    const members = participants.filter((member) => !state.members.has(member));
    for (const member of members) publicKeyFromParticipant(member);
    if (members.length === 0) return;
    await this.changeGroup(id, [{ type: EventType.MEMBERS_ADDED, members }]);
  }

  async removeMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void> {
    const { state } = this.requireGroup(id);
    const removed = participants.filter((member) => state.members.has(member));
    if (removed.length === 0) return;
    await this.changeGroup(
      id,
      removed.map((member) => ({ type: EventType.MEMBER_REMOVED, members: [member] })),
      removed
    );
  }

  async renameGroup(id: ProtocolChatId, title: string): Promise<void> {
    const name = title.trim();
    if (!name) throw new Error('A group needs a name.');
    await this.changeGroup(id, [{ type: EventType.NAME_CHANGED, name }]);
  }

  async leaveGroup(id: ProtocolChatId): Promise<void> {
    const { state } = this.requireGroup(id);
    if (state.members.has(this.self.participantId)) {
      await this.changeGroup(id, [
        { type: EventType.MEMBER_REMOVED, members: [this.self.participantId] },
      ]);
    }
    await this.saveGroup(this.requireGroup(id).state, 'declined');
  }

  async sync(): Promise<void> {
    await this.history.run(() =>
      this.serially(async () => {
        await this.catchUp();
        await this.flushAcks();
      })
    );
    await this.pollOnce();
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

  async streamDeletedMessages(
    listener: (id: ProtocolChatId, messageIds: MessageId[]) => void
  ): Promise<Unsubscribe> {
    this.deletionListeners.add(listener);
    return () => this.deletionListeners.delete(listener);
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.work;
    await this.node.close?.();
    this.messageListeners.clear();
    this.chatListeners.clear();
    this.deletionListeners.clear();
  }
}

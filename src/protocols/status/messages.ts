/**
 * The status-go protobufs this adapter reads and writes, by field number.
 * Only the fields DMs and groups use; anything else is skipped on read.
 */
import { ProtoFields, ProtoWriter } from './proto';

export const AppType = {
  CHAT_MESSAGE: 1,
  CONTACT_UPDATE: 2,
  MEMBERSHIP_UPDATE_MESSAGE: 3,
  EMOJI_REACTION: 22,
  CHAT_IDENTITY: 24,
  EDIT_MESSAGE: 29,
  DELETE_MESSAGE: 31,
  ACCEPT_CONTACT_REQUEST: 46,
  RETRACT_CONTACT_REQUEST: 47,
} as const;

export const MessageType = {
  ONE_TO_ONE: 1,
  PRIVATE_GROUP: 3,
} as const;

export const ContentType = {
  TEXT_PLAIN: 1,
  STICKER: 2,
  EMOJI: 4,
  IMAGE: 7,
  AUDIO: 8,
  CONTACT_REQUEST: 11,
  BRIDGE_MESSAGE: 18,
} as const;

export const AudioType = {
  AAC: 1,
  AMR: 2,
} as const;

export const EventType = {
  CHAT_CREATED: 1,
  NAME_CHANGED: 2,
  MEMBERS_ADDED: 3,
  MEMBER_JOINED: 4,
  MEMBER_REMOVED: 5,
  ADMINS_ADDED: 6,
  ADMIN_REMOVED: 7,
  COLOR_CHANGED: 8,
  IMAGE_CHANGED: 9,
} as const;

export interface PropagatedState {
  localClock: number;
  localState: number;
  remoteClock: number;
  remoteState: number;
}

export interface WireImage {
  payload: Uint8Array;
  format: number;
  width: number;
  height: number;
}

export interface WireChatMessage {
  clock: number;
  timestamp: number;
  text: string;
  responseTo: string;
  chatId: string;
  messageType: number;
  contentType: number;
  displayName: string;
  image?: WireImage;
  audio?: { payload: Uint8Array; type: number; durationMs: number };
  bridge?: { userName: string; content: string };
  contactRequestState?: PropagatedState;
}

export interface WireReaction {
  clock: number;
  chatId: string;
  messageId: string;
  messageType: number;
  emoji: string;
  legacyType: number;
  retracted: boolean;
}

export interface WireMembershipUpdate {
  chatId: string;
  events: Uint8Array[];
  message?: WireChatMessage;
  reaction?: WireReaction;
}

export interface WireGroupEvent {
  clock: number;
  members: string[];
  name: string;
  type: number;
  color: string;
  image?: Uint8Array;
}

export interface WireContactUpdate {
  clock: number;
  displayName: string;
  contactRequestClock: number;
  contactRequestState?: PropagatedState;
}

export interface WireEncrypted {
  payload: Uint8Array;
  dhKey?: Uint8Array;
  x3dh?: { key: Uint8Array; id: Uint8Array };
  ratchet?: { key: Uint8Array; n: number; pn: number; id: Uint8Array };
  hashRatchet: boolean;
}

export interface WireProtocolMessage {
  installationId: string;
  encrypted: Map<string, WireEncrypted>;
  publicMessage?: Uint8Array;
}

export interface MvdsMessage {
  groupId: Uint8Array;
  timestamp: number;
  body: Uint8Array;
}

export interface MvdsPayload {
  acks: Uint8Array[];
  messages: MvdsMessage[];
  others: number;
}

export interface WireApplicationMessage {
  signature: Uint8Array;
  payload: Uint8Array;
  type: number;
}

function encodeState(state: PropagatedState): Uint8Array {
  return new ProtoWriter()
    .uint(1, state.localClock)
    .uint(2, state.localState)
    .uint(3, state.remoteClock)
    .uint(4, state.remoteState)
    .finish();
}

function decodeState(fields: ProtoFields | undefined): PropagatedState | undefined {
  return (
    fields && {
      localClock: fields.number(1),
      localState: fields.number(2),
      remoteClock: fields.number(3),
      remoteState: fields.number(4),
    }
  );
}

export function encodeChatMessage(message: WireChatMessage): Uint8Array {
  const image =
    message.image &&
    new ProtoWriter()
      .bytes(1, message.image.payload)
      .uint(2, message.image.format)
      .uint(4, message.image.width)
      .uint(5, message.image.height)
      .finish();
  const audio =
    message.audio &&
    new ProtoWriter()
      .bytes(1, message.audio.payload)
      .uint(2, message.audio.type)
      .uint(3, message.audio.durationMs)
      .finish();
  return new ProtoWriter()
    .uint(1, message.clock)
    .uint(2, message.timestamp)
    .string(3, message.text)
    .string(4, message.responseTo)
    .string(6, message.chatId)
    .uint(7, message.messageType)
    .uint(8, message.contentType)
    .message(10, image)
    .message(11, audio)
    .string(14, message.displayName)
    .message(15, message.contactRequestState && encodeState(message.contactRequestState))
    .finish();
}

function readChatMessage(fields: ProtoFields): WireChatMessage {
  const image = fields.message(10);
  const audio = fields.message(11);
  const bridge = fields.message(100);
  return {
    clock: fields.number(1),
    timestamp: fields.number(2),
    text: fields.string(3),
    responseTo: fields.string(4),
    chatId: fields.string(6),
    messageType: fields.number(7),
    contentType: fields.number(8),
    displayName: fields.string(14),
    image: image && {
      payload: image.bytes(1),
      format: image.number(2),
      width: image.number(4),
      height: image.number(5),
    },
    audio: audio && {
      payload: audio.bytes(1),
      type: audio.number(2),
      durationMs: audio.number(3),
    },
    bridge: bridge && {
      userName: bridge.string(2),
      content: bridge.string(5),
    },
    contactRequestState: decodeState(fields.message(15)),
  };
}

export function decodeChatMessage(bytes: Uint8Array): WireChatMessage {
  return readChatMessage(ProtoFields.parse(bytes));
}

export function encodeReaction(reaction: WireReaction): Uint8Array {
  return new ProtoWriter()
    .uint(1, reaction.clock)
    .string(2, reaction.chatId)
    .string(3, reaction.messageId)
    .uint(4, reaction.messageType)
    .uint(5, reaction.legacyType)
    .bool(6, reaction.retracted)
    .string(8, reaction.emoji)
    .finish();
}

function readReaction(fields: ProtoFields): WireReaction {
  return {
    clock: fields.number(1),
    chatId: fields.string(2),
    messageId: fields.string(3),
    messageType: fields.number(4),
    legacyType: fields.number(5),
    retracted: fields.bool(6),
    emoji: fields.string(8),
  };
}

export function decodeReaction(bytes: Uint8Array): WireReaction {
  return readReaction(ProtoFields.parse(bytes));
}

export function encodeMembershipUpdate(update: Omit<WireMembershipUpdate, 'reaction'>): Uint8Array {
  return new ProtoWriter()
    .string(1, update.chatId)
    .repeatedBytes(2, update.events)
    .message(3, update.message && encodeChatMessage(update.message))
    .finish();
}

export function decodeMembershipUpdate(bytes: Uint8Array): WireMembershipUpdate {
  const fields = ProtoFields.parse(bytes);
  const message = fields.message(3);
  const reaction = fields.message(4);
  return {
    chatId: fields.string(1),
    events: fields.repeatedBytes(2),
    message: message && readChatMessage(message),
    reaction: reaction && readReaction(reaction),
  };
}

export function encodeGroupEvent(event: WireGroupEvent): Uint8Array {
  return new ProtoWriter()
    .uint(1, event.clock)
    .repeatedString(2, event.members)
    .string(3, event.name)
    .uint(4, event.type)
    .string(5, event.color)
    .bytes(6, event.image)
    .finish();
}

export function decodeGroupEvent(bytes: Uint8Array): WireGroupEvent {
  const fields = ProtoFields.parse(bytes);
  return {
    clock: fields.number(1),
    members: fields.repeatedStrings(2),
    name: fields.string(3),
    type: fields.number(4),
    color: fields.string(5),
    image: fields.has(6) ? fields.bytes(6) : undefined,
  };
}

export function encodeContactUpdate(update: WireContactUpdate & { publicKey: string }): Uint8Array {
  return new ProtoWriter()
    .uint(1, update.clock)
    .string(4, update.displayName)
    .uint(5, update.contactRequestClock)
    .message(6, update.contactRequestState && encodeState(update.contactRequestState))
    .string(7, update.publicKey)
    .finish();
}

export function decodeContactUpdate(bytes: Uint8Array): WireContactUpdate {
  const fields = ProtoFields.parse(bytes);
  return {
    clock: fields.number(1),
    displayName: fields.string(4),
    contactRequestClock: fields.number(5),
    contactRequestState: decodeState(fields.message(6)),
  };
}

export function encodeContactRequestDecision(decision: { id: string; clock: number }): Uint8Array {
  return new ProtoWriter().string(1, decision.id).uint(2, decision.clock).finish();
}

export function decodeContactRequestDecision(bytes: Uint8Array): { id: string; clock: number } {
  const fields = ProtoFields.parse(bytes);
  return { id: fields.string(1), clock: fields.number(2) };
}

export interface WireIdentityImage {
  name: string;
  payload: Uint8Array;
  format: number;
  encryptionKeys: Uint8Array[];
  encrypted: boolean;
}

export interface WireChatIdentity {
  clock: number;
  displayName: string;
  images: WireIdentityImage[];
}

export function encodeChatIdentity(identity: { clock: number; displayName: string }): Uint8Array {
  return new ProtoWriter().uint(1, identity.clock).string(4, identity.displayName).finish();
}

export function decodeChatIdentity(bytes: Uint8Array): WireChatIdentity {
  const fields = ProtoFields.parse(bytes);
  return {
    clock: fields.number(1),
    displayName: fields.string(4),
    images: fields.repeatedMessages(3).flatMap((entry) => {
      const image = entry.message(2);
      return image
        ? [
            {
              name: entry.string(1),
              payload: image.bytes(1),
              format: image.number(3),
              encryptionKeys: image.repeatedBytes(4),
              encrypted: image.bool(5),
            },
          ]
        : [];
    }),
  };
}

export interface WireEdit {
  clock: number;
  text: string;
  chatId: string;
  messageId: string;
  messageType: number;
  contentType: number;
}

export function encodeEdit(edit: WireEdit): Uint8Array {
  return new ProtoWriter()
    .uint(1, edit.clock)
    .string(2, edit.text)
    .string(3, edit.chatId)
    .string(4, edit.messageId)
    .uint(6, edit.messageType)
    .uint(7, edit.contentType)
    .finish();
}

export function decodeEdit(bytes: Uint8Array): WireEdit {
  const fields = ProtoFields.parse(bytes);
  return {
    clock: fields.number(1),
    text: fields.string(2),
    chatId: fields.string(3),
    messageId: fields.string(4),
    messageType: fields.number(6),
    contentType: fields.number(7),
  };
}

export interface WireDelete {
  clock: number;
  chatId: string;
  messageId: string;
  messageType: number;
  deletedBy: string;
}

export function encodeDelete(deletion: WireDelete): Uint8Array {
  return new ProtoWriter()
    .uint(1, deletion.clock)
    .string(2, deletion.chatId)
    .string(3, deletion.messageId)
    .uint(5, deletion.messageType)
    .string(6, deletion.deletedBy)
    .finish();
}

export function decodeDelete(bytes: Uint8Array): WireDelete {
  const fields = ProtoFields.parse(bytes);
  return {
    clock: fields.number(1),
    chatId: fields.string(2),
    messageId: fields.string(3),
    messageType: fields.number(5),
    deletedBy: fields.string(6),
  };
}

export function encodeApplicationMessage(message: WireApplicationMessage): Uint8Array {
  return new ProtoWriter()
    .bytes(1, message.signature)
    .bytes(2, message.payload)
    .uint(3, message.type)
    .finish();
}

export function decodeApplicationMessage(bytes: Uint8Array): WireApplicationMessage {
  const fields = ProtoFields.parse(bytes);
  return { signature: fields.bytes(1), payload: fields.bytes(2), type: fields.number(3) };
}

export function encodeMvds(payload: { acks?: Uint8Array[]; messages?: MvdsMessage[] }): Uint8Array {
  const writer = new ProtoWriter().repeatedBytes(5001, payload.acks);
  for (const message of payload.messages ?? []) {
    writer.message(
      5004,
      new ProtoWriter()
        .bytes(6001, message.groupId)
        .uint(6002, message.timestamp)
        .bytes(6003, message.body)
        .finish()
    );
  }
  return writer.finish();
}

export function decodeMvds(bytes: Uint8Array): MvdsPayload {
  const fields = ProtoFields.parse(bytes);
  return {
    acks: fields.repeatedBytes(5001),
    messages: fields.repeatedMessages(5004).map((message) => ({
      groupId: message.bytes(6001),
      timestamp: message.number(6002),
      body: message.bytes(6003),
    })),
    others:
      fields.repeatedBytes(5002).length +
      fields.repeatedBytes(5003).length +
      fields.repeatedBytes(5005).length,
  };
}

export function encodeBundle(bundle: {
  identity: Uint8Array;
  installationId: string;
  signedPreKey: Uint8Array;
  signature: Uint8Array;
  timestamp: bigint;
}): Uint8Array {
  const signedPreKey = new ProtoWriter().bytes(1, bundle.signedPreKey).finish();
  return new ProtoWriter()
    .bytes(1, bundle.identity)
    .message(
      2,
      new ProtoWriter().string(1, bundle.installationId).message(2, signedPreKey).finish()
    )
    .bytes(4, bundle.signature)
    .uint(5, bundle.timestamp)
    .finish();
}

export function encodeProtocolMessage(message: {
  installationId: string;
  bundle?: Uint8Array;
  encrypted: Map<string, { dhKey: Uint8Array; payload: Uint8Array }>;
}): Uint8Array {
  const writer = new ProtoWriter().string(2, message.installationId).message(3, message.bundle);
  for (const [installation, entry] of message.encrypted) {
    const value = new ProtoWriter()
      .bytes(3, entry.payload)
      .message(101, new ProtoWriter().bytes(1, entry.dhKey).finish())
      .finish();
    writer.message(101, new ProtoWriter().string(1, installation).message(2, value).finish());
  }
  return writer.finish();
}

export function decodeProtocolMessage(bytes: Uint8Array): WireProtocolMessage {
  const fields = ProtoFields.parse(bytes);
  const encrypted = new Map<string, WireEncrypted>();
  for (const entry of fields.repeatedMessages(101)) {
    const value = entry.message(2);
    if (!value) continue;
    const x3dh = value.message(1);
    const ratchet = value.message(2);
    encrypted.set(entry.string(1), {
      payload: value.bytes(3),
      dhKey: value.message(101)?.bytes(1),
      x3dh: x3dh && { key: x3dh.bytes(1), id: x3dh.bytes(4) },
      ratchet: ratchet && {
        key: ratchet.bytes(1),
        n: ratchet.number(2),
        pn: ratchet.number(3),
        id: ratchet.bytes(4),
      },
      hashRatchet: value.has(102),
    });
  }
  return {
    installationId: fields.string(2),
    encrypted,
    publicMessage: fields.has(102) ? fields.bytes(102) : undefined,
  };
}

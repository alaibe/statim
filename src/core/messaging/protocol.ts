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
} from './types';
import type { HistoryState } from './history';

/**
 * A protocol that signs in interactively (a phone number, a one-time code)
 * reports the step it is waiting on; null once signed in.
 */
export interface LoginState {
  step: 'phone' | 'code' | 'password';
  /** Replaces the generic "Sign in to …" heading when the step means something more specific. */
  title?: string;
  hint?: string;
  error?: string;
}

export interface GroupInfo {
  description?: string;
  link?: string;
  memberCount?: number;
  avatarUri?: string;
  slowModeDelay?: number;
  canSetSlowMode?: boolean;
}

export interface PublicChatPreview extends GroupInfo {
  /** What `joinPublicChat` takes: the protocol's chat id, an alias or an invite link. */
  id: string;
  title: string;
  kind: 'group' | 'channel';
  joined: boolean;
  requiresApproval?: boolean;
  joinUnavailableReason?: string;
}

export interface JoinRequest {
  participantId: ParticipantId;
  name: string;
  bio?: string;
  requestedAt: number;
}

export interface MentionCandidate {
  id: ParticipantId;
  name: string;
  /** Inserted as typed where there is one; without, the mention is a link to the person. */
  address?: string;
}

export interface ChatSession {
  readonly self: SelfParticipant;
  readonly sendsVideo?: boolean;
  /** Messages carry `threadRoot`, and `send` posts into a thread. */
  readonly threads?: boolean;
  readonly sendsCustom?: boolean;

  listChats(): Promise<ProtocolChat[]>;
  getMessages(
    id: ProtocolChatId,
    opts?: { limit?: number; before?: { sentAt: number; id: MessageId } }
  ): Promise<ProtocolMessage[]>;
  searchMessages?(query: string, id?: ProtocolChatId): Promise<ProtocolMessage[]>;
  countUnread?(id: ProtocolChatId, since: number): Promise<number>;

  resolveParticipant(addressOrId: string): Promise<ParticipantId | null>;
  resolveAddresses(ids: ParticipantId[]): Promise<Record<ParticipantId, string>>;
  /** Human names where the protocol has them; addresses are what gets copied. */
  resolveNames?(ids: ParticipantId[]): Promise<Record<ParticipantId, string>>;
  mentionCandidates?(id: ProtocolChatId, query: string): Promise<MentionCandidate[]>;
  createDm(participant: ParticipantId): Promise<ProtocolChat>;
  createGroup(participants: ParticipantId[], title: string): Promise<ProtocolChat>;
  previewPublicChat?(usernameOrLink: string): Promise<PublicChatPreview>;
  joinPublicChat?(reference: string): Promise<ProtocolChat | null>;
  createInviteLink?(id: ProtocolChatId, requiresApproval: boolean): Promise<string>;
  getJoinRequests?(id: ProtocolChatId): Promise<JoinRequest[]>;
  processJoinRequest?(
    id: ProtocolChatId,
    participantId: ParticipantId,
    approve: boolean
  ): Promise<void>;

  getMembers(id: ProtocolChatId): Promise<GroupMember[]>;
  getGroupInfo?(id: ProtocolChatId): Promise<GroupInfo>;
  setSlowModeDelay?(id: ProtocolChatId, seconds: number): Promise<void>;
  addMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void>;
  removeMembers(id: ProtocolChatId, participants: ParticipantId[]): Promise<void>;
  /** Removes them and keeps them out, where removing alone lets them come back. */
  banMember?(id: ProtocolChatId, participant: ParticipantId): Promise<void>;
  setMemberMuted?(id: ProtocolChatId, participant: ParticipantId, muted: boolean): Promise<void>;
  renameGroup(id: ProtocolChatId, title: string): Promise<void>;
  leaveGroup(id: ProtocolChatId): Promise<void>;

  send(
    id: ProtocolChatId,
    content: MessageContent,
    replyTo?: MessageId,
    threadRoot?: MessageId
  ): Promise<MessageId>;
  /** Emits the edited message through streamMessages when the server confirms it. */
  editMessage?(id: ProtocolChatId, messageId: MessageId, text: string): Promise<void>;
  deleteMessage?(id: ProtocolChatId, messageId: MessageId): Promise<void>;
  deleteMessageForMe?(id: ProtocolChatId, messageId: MessageId): Promise<void>;
  votePoll?(id: ProtocolChatId, messageId: MessageId, optionIds: number[]): Promise<void>;
  createPoll?(id: ProtocolChatId, question: string, options: string[]): Promise<void>;
  listPinnedMessages?(id: ProtocolChatId): Promise<ProtocolMessage[]>;
  setMessagePinned?(id: ProtocolChatId, messageId: MessageId, pinned: boolean): Promise<void>;
  /** Fetches a message's files that are not on this device yet; the message streams again once they are. */
  fetchMedia?(id: ProtocolChatId, messageId: MessageId): Promise<void>;
  streamDeletedMessages?(
    listener: (id: ProtocolChatId, messageIds: MessageId[]) => void
  ): Promise<Unsubscribe>;

  setConsent?(id: ProtocolChatId, consent: ConsentDecision): Promise<void>;

  sendReadReceipt?(id: ProtocolChatId): Promise<void>;
  setMarkedUnread?(id: ProtocolChatId, unread: boolean): Promise<void>;
  saveDraft?(id: ProtocolChatId, text: string): Promise<void>;
  setTyping?(id: ProtocolChatId, typing: boolean): Promise<void>;
  /** For protocols that only say who is online when asked; stops when the chat closes. */
  watchPresence?(id: ProtocolChatId): Unsubscribe;

  sync(): Promise<void>;
  subscribeHistory?(listener: (state: HistoryState) => void): Unsubscribe;

  subscribeLogin?(listener: (login: LoginState | null) => void): Unsubscribe;
  submitLogin?(value: string): Promise<void>;
  signOut?(): Promise<void>;

  streamMessages(onMessage: (m: ProtocolMessage) => void): Promise<Unsubscribe>;
  streamChats(onChat: (c: ProtocolChat) => void): Promise<Unsubscribe>;
  /** Every chat, once the session can list them all; `first` is its first listing. */
  whenListed?(first: ProtocolChat[]): Promise<ProtocolChat[]>;

  disconnect(): Promise<void>;
}

export interface XmtpCapabilities {
  eraseLocalDatabase(): Promise<void>;
  listInstallations?(): Promise<{ id: string; createdAt?: number; current: boolean }[]>;
  revokeInstallations?(ids: string[]): Promise<void>;
}

export type GroupModel = 'enforced' | 'participant-set';

export interface ChatProtocolMeta {
  trustModel: string;
  properties: {
    endToEndEncrypted: boolean;
    forwardSecrecy: boolean;
    metadataPrivacy: 'low' | 'medium' | 'high';
    maxGroupSize: number | 'unbounded';
    groupModel: GroupModel;
    durableHistory: boolean;
  };
}

export interface CustomContentType {
  typeId: string;
  fallback(data: unknown): string;
}

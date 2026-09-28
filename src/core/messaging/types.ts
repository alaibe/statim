import type { Widget } from '@/design/widgets';

import type { ProtocolId } from './namespace';

declare const chatIdBrand: unique symbol;
export type ChatId = string & { readonly [chatIdBrand]: true };
declare const protocolChatIdBrand: unique symbol;
export type ProtocolChatId = string & { readonly [protocolChatIdBrand]: true };
export type AnyChatId = ChatId | ProtocolChatId;
export type MessageId = string;
export type ParticipantId = string;

export interface LiveView {
  readonly pluginId: string;
  readonly view: string;
  readonly args?: readonly string[];
}

export type WidgetContent = {
  readonly kind: 'widget';
  readonly widget: Widget;
  readonly fallback: string;
  readonly live?: LiveView;
};

export type MessageContent =
  | { readonly kind: 'text'; readonly text: string }
  | WidgetContent
  | {
      readonly kind: 'custom';
      readonly typeId: string;
      readonly data: unknown;
      readonly fallback?: string;
    }
  | {
      readonly kind: 'image';
      readonly uri: string;
      readonly width?: number;
      readonly height?: number;
      readonly size?: number;
      readonly caption?: string;
      readonly name?: string;
      readonly mimeType?: string;
    }
  | {
      readonly kind: 'file';
      readonly uri: string;
      readonly name: string;
      readonly mimeType?: string;
      readonly size?: number;
    }
  | {
      readonly kind: 'voice';
      readonly uri: string;
      readonly durationMs: number;
      readonly size?: number;
      readonly name?: string;
      readonly mimeType?: string;
    }
  | {
      readonly kind: 'video';
      readonly uri: string;
      readonly width?: number;
      readonly height?: number;
      readonly durationMs?: number;
      readonly caption?: string;
      readonly name?: string;
      readonly mimeType?: string;
      readonly size?: number;
      /** Silent and looping, the way a messenger plays a GIF. */
      readonly gif?: boolean;
    }
  | {
      readonly kind: 'poll';
      readonly question: string;
      readonly options: readonly {
        readonly text: string;
        readonly percentage: number;
        readonly chosen: boolean;
      }[];
      readonly totalVoters: number;
      readonly multiple: boolean;
      readonly closed: boolean;
    }
  | {
      readonly kind: 'reaction';
      readonly targetId: MessageId;
      readonly emoji: string;
      readonly action: 'added' | 'removed';
    }
  | { readonly kind: 'system'; readonly text: string }
  | { readonly kind: 'unsupported'; readonly typeId: string; readonly fallback: string };

export type DeliveryStatus = 'sending' | 'sent' | 'failed';

export interface ChatMessage<Id extends AnyChatId = ChatId> {
  readonly id: MessageId;
  readonly chatId: Id;
  readonly senderId: ParticipantId;
  readonly sentAt: number;
  readonly content: MessageContent;
  readonly fromMe: boolean;
  readonly status: DeliveryStatus;
  readonly replyTo?: MessageId;
  /** Set on a reply inside a thread: the message that started it. */
  readonly threadRoot?: MessageId;
  readonly reactions?: Readonly<Record<string, readonly ParticipantId[]>>;
  readonly readAt?: number;
  readonly forwarded?: boolean;
  readonly isPinned?: boolean;
  readonly privateToMe?: boolean;
  /** A chat list's summary of its latest message, under an id no message has. */
  readonly preview?: boolean;
  readonly edited?: boolean;
}

export type ProtocolMessage = ChatMessage<ProtocolChatId>;

export type ChatKind = 'dm' | 'group' | 'channel';

export type Consent = 'accepted' | 'declined' | 'request';

export type ConsentDecision = Exclude<Consent, 'request'>;

export type GroupRole = 'member' | 'admin' | 'owner';

export interface GroupMember {
  readonly id: ParticipantId;
  readonly role: GroupRole;
  readonly muted?: boolean;
}

interface ChatFields<Id extends AnyChatId> {
  readonly id: Id;
  readonly kind: ChatKind;
  readonly title: string;
  readonly avatarUri?: string;
  readonly memberIds: readonly ParticipantId[];
  /** How many members the protocol reports, where memberIds may not list them all. */
  readonly memberCount?: number;
  readonly createdAt: number;
  readonly lastMessage?: ChatMessage<Id>;
  readonly unreadCount?: number;
  readonly mentionCount?: number;
  readonly markedUnread?: boolean;
  /** The draft the protocol keeps for this chat; empty when there is none. Unset where drafts stay on the device. */
  readonly draft?: string;
  readonly pendingJoinRequests?: number;
  readonly canSend?: boolean;
  readonly typing?: boolean;
  readonly online?: boolean;
  readonly lastSeenAt?: number;
  readonly consent: Consent;
  /** Where the chat really lives when a bridge carries it: "Slack", "Discord". */
  readonly network?: string;
  readonly selfRole?: GroupRole;
  /** Unset where the protocol does not say; pinning is then offered and deleting others' messages is not. */
  readonly canPin?: boolean;
  readonly canDeleteOthers?: boolean;
}

export type ProtocolChat = ChatFields<ProtocolChatId>;

export interface Chat extends ChatFields<ChatId> {
  readonly protocol: ProtocolId;
}

export interface SelfParticipant {
  readonly participantId: ParticipantId;
  readonly address: string;
}

export type Unsubscribe = () => void;

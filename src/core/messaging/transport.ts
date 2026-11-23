import type { TransportChat } from "./message-store";
import type { ProtocolId } from "./namespace";
import type { LinkState } from "./protocol";
import type { MessageContent, MessageId, ParticipantId, ProtocolChatId, SelfParticipant, Unsubscribe } from "./types";

export interface TransportSink {
  deliverToParticipants(
    participants: ParticipantId[],
    message: IncomingMessage,
    meta?: { title?: string; createdAt?: number },
  ): Promise<void>;
  /** Takes back the reaction `undoes` names if its sender sent it; anything else is left alone. */
  withdraw(participants: ParticipantId[], withdrawal: Withdrawal): Promise<void>;
}

export interface IncomingMessage {
  id: MessageId;
  senderId: ParticipantId;
  sentAt: number;
  content: MessageContent;
  replyTo?: MessageId;
  fromMe: boolean;
  transportTimestamp?: number;
}

export interface Withdrawal extends Omit<IncomingMessage, "content" | "replyTo"> {
  undoes: MessageId;
}

export interface SendMeta {
  replyTo?: MessageId;
  /** Your own reaction that a removal takes back. */
  undoes?: MessageId;
}

export interface SendResult {
  id: MessageId;
  /** Only for a transport that cannot read its own message back; with a self-addressed copy it duplicates. */
  localMessage?: IncomingMessage;
}

export interface ChatTransport {
  readonly protocolId: ProtocolId;
  readonly self: SelfParticipant;

  chatIdFor(participants: ParticipantId[]): ProtocolChatId;

  /** `since` is the newest persisted message time, not the last delivery; unset without local history. */
  openChat?(chat: TransportChat, opts?: { since?: number }): Promise<void>;

  send(chat: TransportChat, content: MessageContent, meta?: SendMeta): Promise<SendResult>;
  confirmSend?(chatId: ProtocolChatId, messageId: MessageId): void;

  resolveParticipant(addressOrId: string): Promise<ParticipantId | null>;
  resolveAddresses(ids: ParticipantId[]): Promise<Record<ParticipantId, string>>;

  sync(): Promise<void>;
  /** Re-opens connections that dropped while the app was away, saying whether any had; never throws. */
  resume?(): boolean;
  subscribeLink?(listener: (link: LinkState) => void): Unsubscribe;
  disconnect(): Promise<void>;

  readonly rosterIsFixed: { onAdd: string; onRemove: string };
}

import type {
  MessageContent,
  MessageId,
  ParticipantId,
  ProtocolChatId,
  SelfParticipant,
} from './types';
import type { TransportChat } from './message-store';

export interface TransportSink {
  deliverToRoutingKey(routingKey: string, message: IncomingMessage): Promise<void>;

  deliverToParticipants(
    participants: ParticipantId[],
    message: IncomingMessage,
    meta?: { title?: string; createdAt?: number }
  ): Promise<void>;
}

export interface IncomingMessage {
  id: MessageId;
  senderId: ParticipantId;
  sentAt: number;
  content: MessageContent;
  fromMe: boolean;
  transportTimestamp?: number;
}

export interface SendResult {
  id: MessageId;
  /**
   * Required only when a transport cannot read its own published message back.
   * Supplying it as well as a self-addressed wire copy would duplicate the send.
   */
  localMessage?: IncomingMessage;
}

export interface ChatTransport {
  readonly protocolId: string;
  readonly self: SelfParticipant;
  cursorUpperBound?(): number;

  chatIdFor(participants: ParticipantId[]): ProtocolChatId;

  routingKeyFor?(participants: ParticipantId[]): string;

  /**
   * `since` is the newest persisted message time, not the last delivery time.
   * It is undefined when the chat has no local history.
   */
  openChat?(chat: TransportChat, opts?: { since?: number }): Promise<void>;

  closeChat?(chat: TransportChat): Promise<void>;

  send(chat: TransportChat, content: MessageContent): Promise<SendResult>;
  confirmSend?(chatId: ProtocolChatId, messageId: MessageId): void;

  resolveParticipant(addressOrId: string): Promise<ParticipantId | null>;
  resolveAddresses(ids: ParticipantId[]): Promise<Record<ParticipantId, string>>;

  sync(): Promise<void>;
  disconnect(): Promise<void>;

  readonly rosterIsFixed: { onAdd: string; onRemove: string };
}

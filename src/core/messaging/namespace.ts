/** Chat ids carry their own routing: `<protocol>-<native id>`. */
import { oneOf } from '@/lib/guards';

import type {
  ChatMessage,
  Chat,
  ChatId,
  ProtocolChatId,
  ProtocolMessage,
  ProtocolChat,
} from './types';

export const PROTOCOL_IDS = ['xmtp', 'nostr', 'status', 'telegram', 'matrix', 'local'] as const;
export type ProtocolId = (typeof PROTOCOL_IDS)[number];

export const NATIVE_ID = /^[A-Za-z0-9_-]+$/;

export const LOCAL_PROTOCOL = 'local' satisfies ProtocolId;

export const isProtocolId = oneOf(...PROTOCOL_IDS);

export const protocolKeys = <T>(record: Partial<Record<ProtocolId, T>>) =>
  Object.keys(record) as ProtocolId[];

export const protocolEntries = <T>(record: Partial<Record<ProtocolId, T>>) =>
  Object.entries(record) as [ProtocolId, T][];

export function protocolChatId(raw: string): ProtocolChatId {
  return raw as ProtocolChatId;
}

export function namespacedId(protocol: ProtocolId, nativeId: ProtocolChatId): ChatId {
  if (!NATIVE_ID.test(nativeId)) {
    throw new Error(
      `Chat id "${nativeId}" is not URL-safe. ` +
        'Adapters must hash or encode ids outside [A-Za-z0-9_-] before returning them.'
    );
  }
  return `${protocol}-${nativeId}` as ChatId;
}

interface SplitId {
  protocol: ProtocolId;
  nativeId: ProtocolChatId;
}

export function parseChatId(raw: string): ChatId | null {
  return split(raw) ? (raw as ChatId) : null;
}

export function parseChatRoute(raw: string): (SplitId & { id: ChatId }) | null {
  const route = split(raw);
  return route && { ...route, id: raw as ChatId };
}

/** Only namespacedId and parseChatId make a ChatId, and both check it splits. */
export function splitChatId(id: ChatId): SplitId {
  return split(id)!;
}

function split(raw: string): SplitId | null {
  const at = raw.indexOf('-');
  if (at <= 0) return null;

  const protocol = raw.slice(0, at);
  const nativeId = raw.slice(at + 1);
  if (!isProtocolId(protocol) || nativeId.length === 0) return null;
  return { protocol, nativeId: protocolChatId(nativeId) };
}

export function protocolOf(id: ChatId): ProtocolId {
  return splitChatId(id).protocol;
}

export function namespaceMessage(protocol: ProtocolId, message: ProtocolMessage): ChatMessage {
  return {
    ...message,
    chatId: namespacedId(protocol, message.chatId),
  };
}

export function namespaceChat(protocol: ProtocolId, chat: ProtocolChat): Chat {
  return {
    ...chat,
    id: namespacedId(protocol, chat.id),
    protocol,
    lastMessage: chat.lastMessage ? namespaceMessage(protocol, chat.lastMessage) : undefined,
  };
}

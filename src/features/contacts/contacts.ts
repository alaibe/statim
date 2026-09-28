import { isLocalChat } from '@/core/messaging/bots';
import { splitRequests } from '@/core/messaging/folders';
import type { ProtocolId } from '@/core/messaging/namespace';
import type { Chat, ParticipantId } from '@/core/messaging/types';

export interface Contact {
  id: ParticipantId;
  protocol: ProtocolId;
  chatId: string;
}

export function contactsOf(
  chats: readonly Chat[],
  selfFor: (protocol: ProtocolId) => ParticipantId | undefined
): Contact[] {
  // Keyed by protocol *and* id: the same person on Nostr and on XMTP is two
  // participants with two different keys, and merging them would claim a link
  // this app cannot verify.
  const byContact = new Map<string, Contact>();
  const { accepted, requests } = splitRequests(chats);

  for (const chat of [...accepted, ...requests]) {
    if (chat.kind !== 'dm') continue;
    if (isLocalChat(chat.id)) continue;

    const self = selfFor(chat.protocol);
    for (const id of chat.memberIds) {
      if (id === self) continue;
      const key = `${chat.protocol}:${id}`;
      if (byContact.has(key)) continue;
      byContact.set(key, { id, protocol: chat.protocol, chatId: chat.id });
    }
  }

  return [...byContact.values()];
}

export function contactKey({ protocol, id, chatId }: Contact): string {
  return JSON.stringify([protocol, id, chatId]);
}

export function fromContactKey(key: string): Contact {
  const [protocol, id, chatId] = JSON.parse(key) as [ProtocolId, string, string];
  return { id, protocol, chatId };
}

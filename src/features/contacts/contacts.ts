import { isLocalChat } from '@/core/messaging/bots';
import { splitRequests } from '@/core/messaging/folders';
import type { Chat, ParticipantId } from '@/core/messaging/types';

export interface Contact {
  id: ParticipantId;
  protocol: Chat['protocol'];
  chatId: string;
}

export function contactsOf(
  chats: readonly Chat[],
  selfFor: (protocol: Chat['protocol']) => ParticipantId | undefined
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
  return JSON.stringify([protocol ?? null, id, chatId]);
}

export function fromContactKey(key: string): Contact {
  const [protocol, id, chatId] = JSON.parse(key) as [string | null, string, string];
  return { id, protocol: protocol ?? undefined, chatId };
}

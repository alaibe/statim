import { isLocalChat } from '@/core/messaging/bots';
import { splitRequests } from '@/core/messaging/folders';
import type { ProtocolId } from '@/core/messaging/namespace';
import type { NetworkId } from '@/core/messaging/networks';
import type { Chat, ParticipantId } from '@/core/messaging/types';
import { networkLabel } from '@/features/protocols/presentation';

export interface Contact {
  id: ParticipantId;
  protocol: ProtocolId;
  /** Where they really are: Slack or Discord for someone reached through a Matrix bridge. */
  network: NetworkId;
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
      byContact.set(key, {
        id,
        protocol: chat.protocol,
        network: chat.network ?? chat.protocol,
        chatId: chat.id,
      });
    }
  }

  return [...byContact.values()];
}

export function contactKey({ protocol, id, network, chatId }: Contact): string {
  return JSON.stringify([protocol, id, network, chatId]);
}

export function fromContactKey(key: string): Contact {
  const [protocol, id, network, chatId] = JSON.parse(key) as [
    ProtocolId,
    string,
    NetworkId,
    string,
  ];
  return { id, protocol, network, chatId };
}

export function contactNetwork({
  protocol,
  network,
}: Pick<Contact, 'protocol' | 'network'>): string {
  return network === protocol
    ? networkLabel(protocol)
    : `${networkLabel(network)} via ${networkLabel(protocol)}`;
}

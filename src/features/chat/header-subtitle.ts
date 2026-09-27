import { formatTimestamp } from '@/core/messaging/preview';
import type { Chat } from '@/core/messaging/types';
import { protocolSubtitle } from '@/features/protocols/presentation';

export function headerSubtitle(chat: Chat): string {
  if (chat.typing) return 'typing…';
  if (chat.kind === 'dm' && chat.online) return 'online';
  if (chat.kind === 'dm' && chat.lastSeenAt) return `last seen ${formatTimestamp(chat.lastSeenAt)}`;
  const requests = chat.pendingJoinRequests;
  if (requests) return requests === 1 ? '1 join request' : `${requests} join requests`;
  const protocol = protocolSubtitle(chat.protocol);
  if (chat.kind === 'channel') return `Channel · ${protocol}`;
  if (chat.kind === 'group')
    return `${chat.memberCount ?? chat.memberIds.length} members · ${protocol}`;
  return protocol;
}

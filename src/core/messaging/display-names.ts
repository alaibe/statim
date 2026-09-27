import { shortAddress } from '@/core/account/keyring';

import { isLocalChat } from './bots';
import { useChatStore } from './chat-store';
import type { Chat, ParticipantId } from './types';

export interface DisplayParticipant {
  id: ParticipantId;
  protocol?: string;
}

export interface ResolvedParticipants {
  names: Record<ParticipantId, string>;
  addresses: Record<ParticipantId, string>;
}

/** What a protocol knows about these participants; a lookup that fails leaves them out. */
export async function resolveParticipants(
  protocol: string | null | undefined,
  ids: ParticipantId[]
): Promise<ResolvedParticipants> {
  const session = protocol ? useChatStore.getState().sessions[protocol] : undefined;
  if (!session || ids.length === 0) return { names: {}, addresses: {} };
  const none: Record<ParticipantId, string> = {};
  const [addresses, names] = await Promise.all([
    session.resolveAddresses(ids).catch(() => none),
    session.resolveNames?.(ids).catch(() => none) ?? none,
  ]);
  return { names, addresses };
}

/** `own` are the names you gave people, through a plugin; they win over the protocol's. */
export function nameFrom(
  id: ParticipantId,
  { names, addresses }: ResolvedParticipants,
  own: Record<ParticipantId, string> = {}
): string {
  return displayName(id, own[id] ?? names[id], addresses[id]);
}

export function displayName(id: ParticipantId, name?: string, address?: string): string {
  return name || (address ? shortAddress(address) : shortAddress(id, 6, 4));
}

export function chatTitle(
  chat: Chat,
  selfId: ParticipantId,
  nameFor: (id: ParticipantId) => string
): string {
  if (chat.kind !== 'dm') return chat.title;
  if (isLocalChat(chat.id)) return chat.title;

  const participant = chat.memberIds.find((id) => id !== selfId) ?? chat.title;
  return nameFor(participant);
}

/** Everyone in the chat but us. */
export function chatParticipants(chat: Chat, selfId: ParticipantId): DisplayParticipant[] {
  return chat.memberIds
    .filter((id) => id !== selfId)
    .map((id) => ({ id, protocol: chat.protocol }));
}

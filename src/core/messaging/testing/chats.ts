import type { Chat } from '../types';
import { asChatId } from './ids';

export function testChat(over: Omit<Partial<Chat>, 'id'> & { id?: string } = {}): Chat {
  const id = asChatId(over.id ?? 'c1');
  return {
    kind: 'dm',
    title: id,
    memberIds: [],
    createdAt: 0,
    consent: 'accepted',
    ...over,
    id,
  };
}

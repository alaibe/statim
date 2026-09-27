import { isLocalChat } from './bots';
import type { ChatId, ChatKind } from './types';

export type ChatScope = 'dm' | 'group' | 'channel';

export function chatScope(id: ChatId, kind?: ChatKind): ChatScope {
  if (isLocalChat(id)) return 'channel';
  return kind ?? 'dm';
}

export function inScope(showIn: readonly ChatScope[] | undefined, scope: ChatScope): boolean {
  return showIn === undefined || showIn.includes(scope);
}

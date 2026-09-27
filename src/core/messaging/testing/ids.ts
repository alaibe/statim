import type { ChatId } from '../types';

/** Fixture ids such as "a" are not valid app ids, which parseChatId would reject. */
export function asChatId(raw: string): ChatId {
  return raw as ChatId;
}

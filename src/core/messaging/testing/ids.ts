import { parseChatId } from '../namespace';
import type { ChatId } from '../types';

export function asChatId(raw: string): ChatId {
  const id = parseChatId(raw);
  if (!id) throw new Error(`"${raw}" is not a chat id. Give it a protocol, like "xmtp-${raw}".`);
  return id;
}

import { decodeId, mentionLink } from '@/core/messaging/mentions';
import type { ParticipantId } from '@/core/messaging/types';

import { parseChatKey } from './keys';

const MENTION_LINK = /\[((?:\\.|[^\\\]])*)\]\(mention:([^)\s]+)\)/g;
const KEY_MENTION = /@(0x[0-9a-f]{130}(?=$|[\s.,:;!?])|zQ3[1-9A-HJ-NP-Za-km-z]+)/g;

/** Status writes a mention as the key, `@0x04…`, and only that form tells the person they were mentioned. */
export function toStatusMentions(text: string): string {
  return text.replace(MENTION_LINK, (_, name: string, encoded: string) => {
    const id = decodeId(encoded);
    const key = id && parseChatKey(id);
    return key ? `@${key}` : name.replace(/\\(.)/g, '$1');
  });
}

export function fromStatusMentions(text: string, nameOf: (id: ParticipantId) => string): string {
  return text.replace(KEY_MENTION, (mention, key: string) => {
    const id = parseChatKey(key);
    return id ? mentionLink(nameOf(id), id) : mention;
  });
}

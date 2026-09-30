import { type Capability, supports } from '@/core/messaging/capability';
import { sessionFor, useChatStore } from '@/core/messaging/chat-store';
import type { ChatId } from '@/core/messaging/types';

export function useSupports(chatId: ChatId) {
  const session = useChatStore((s) => sessionFor(s, chatId));
  return {
    session,
    supports: (key: Capability) => supports(session, key),
    sendsImages: Boolean(session?.sendsImages),
    sendsVideo: Boolean(session?.sendsVideo),
    threads: Boolean(session?.threads),
  };
}

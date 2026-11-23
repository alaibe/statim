import { useChatStore } from "@/core/messaging/chat-store";
import type { ChatId, ChatMessage } from "@/core/messaging/types";
import { useKeyedLoad } from "@/lib/use-keyed-load";

const NONE: readonly ChatMessage[] = Object.freeze([]);

export function usePinnedMessages(id: ChatId, loaded: readonly ChatMessage[], enabled: boolean) {
  const accountId = useChatStore((s) => s.accountId);
  const listPinnedMessages = useChatStore((s) => s.listPinnedMessages);
  const version = loaded
    .filter((message) => message.isPinned)
    .map((message) => message.id)
    .join("|");
  return useKeyedLoad(enabled && accountId ? id : null, listPinnedMessages, version).value ?? NONE;
}

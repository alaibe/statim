import { useChatStore } from '@/core/messaging/chat-store';
import { useKeyedLoad } from '@/lib/use-keyed-load';

const KEY = 'chat.recentEmoji';
const LIMIT = 32;
const NONE: readonly string[] = Object.freeze([]);

export function useRecentEmoji() {
  const accountId = useChatStore((s) => s.accountId);
  const storage = useChatStore((s) => s.accountStorage);
  const loaded = useKeyedLoad(storage ? accountId : null, async () => {
    const saved = await storage?.get<string[]>(KEY).catch(() => undefined);
    return Array.isArray(saved) ? saved : NONE;
  });
  const recent = loaded.value ?? NONE;

  const remember = (emoji: string) => {
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, LIMIT);
    loaded.update(() => next);
    storage?.set(KEY, next).catch(() => {});
  };

  return [recent, remember] as const;
}

import { useChatStore } from '@/core/messaging/chat-store';
import type { Chat, ChatId, ChatMessage } from '@/core/messaging/types';
import { moveInviteText } from '@/plugins/profile/move-invite';

/**
 * `statim://fixture/<name>` opens a made-up chat in a debug build, for the
 * screenshots docs/screenshots/capture.yaml takes of what a fresh account
 * cannot have yet.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (!__DEV__) return path;
  try {
    const name = /fixture\/([\w-]+)/.exec(path)?.[1];
    const seed = name && Object.hasOwn(FIXTURES, name) ? FIXTURES[name] : null;
    return seed ? `/chat/${seed()}` : path;
  } catch {
    return path;
  }
}

const FIXTURES: Record<string, () => ChatId> = {
  'move-invite': () =>
    seed('telegram-alice' as ChatId, 'Alice', [
      [false, 'Did the flat photos come through?', 9],
      [true, 'They did, thanks. The second one is great', 8],
      [false, moveInviteText('0x4c7a1e0b9d3f2a6e8b5c1d7f0a9e3b2c6d8f1a4e'), 1],
    ]),
};

function seed(
  id: ChatId,
  name: string,
  lines: [fromMe: boolean, text: string, minutesAgo: number][]
): ChatId {
  const now = Date.now();
  const messages: ChatMessage[] = lines.map(([fromMe, text, minutesAgo], n) => ({
    id: `fixture-${n}`,
    chatId: id,
    senderId: fromMe ? 'me' : name,
    sentAt: now - minutesAgo * 60_000,
    content: { kind: 'text', text },
    fromMe,
    status: 'sent',
  }));
  const chat: Chat = {
    id,
    protocol: 'telegram',
    kind: 'dm',
    title: name,
    memberIds: [name],
    createdAt: now - 86_400_000,
    consent: 'accepted',
    lastMessage: messages.at(-1),
  };
  useChatStore.setState((state) => ({
    chats: [chat, ...state.chats.filter((c) => c.id !== id)],
    messages: { ...state.messages, [id]: messages },
    rawMessages: { ...state.rawMessages, [id]: messages },
  }));
  return id;
}

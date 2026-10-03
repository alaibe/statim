import type { ChatMessage, Chat } from '../messaging/types';
import { arrivals, worthNotifying } from './use-notifications';
import { testChat } from '@/core/messaging/testing/chats';
import { asChatId } from '@/core/messaging/testing/ids';

const SINCE = 1_000;

function message(id: string, sentAt: number): ChatMessage {
  return {
    id,
    chatId: asChatId('telegram-1'),
    senderId: 'other',
    sentAt,
    content: { kind: 'text', text: id },
    fromMe: false,
    status: 'sent',
  };
}

function chat(lastMessage?: ChatMessage, extra: Partial<Chat> = {}): Chat {
  return testChat({ id: 'telegram-1', title: 'Bob', lastMessage, ...extra });
}

describe('arrivals', () => {
  it('reports a message that replaced an older one', () => {
    const next = chat(message('b', 2_000));
    expect(arrivals([chat(message('a', 1_500))], [next], SINCE)).toEqual([
      { chat: next, message: next.lastMessage },
    ]);
  });

  it('ignores the same message announced again, as a presence or typing update does', () => {
    const before = chat(message('a', 2_000));
    const after = chat({ ...message('a', 2_000) }, { typing: true });
    expect(arrivals([before], [after], SINCE)).toEqual([]);
  });

  it('ignores chats listed at launch with messages from before it', () => {
    expect(arrivals([], [chat(message('a', 500))], SINCE)).toEqual([]);
  });

  it('reports a new chat that starts with a new message', () => {
    expect(arrivals([], [chat(message('a', 2_000))], SINCE)).toHaveLength(1);
  });

  it('ignores the older message a deletion brings back', () => {
    expect(arrivals([chat(message('b', 3_000))], [chat(message('a', 2_000))], SINCE)).toEqual([]);
  });
});

describe('worthNotifying', () => {
  const bob = chat();

  it('notifies a new message from someone else', () => {
    expect(worthNotifying(bob, message('a', 2_000), {}, undefined)).toBe(true);
  });

  it('stays quiet for the chat on screen', () => {
    expect(worthNotifying(bob, message('a', 2_000), {}, 'telegram-1')).toBe(false);
  });

  it('notifies a chat other than the one on screen', () => {
    expect(worthNotifying(bob, message('a', 2_000), {}, 'telegram-2')).toBe(true);
  });

  it('stays quiet for a muted chat', () => {
    const prefs = { [bob.id]: { muted: true } };
    expect(worthNotifying(bob, message('a', 2_000), prefs, undefined)).toBe(false);
  });

  it('stays quiet for a DM whose other participant you blocked', () => {
    expect(worthNotifying({ ...bob, blocked: true }, message('a', 2_000), {}, undefined)).toBe(
      false
    );
  });

  it('stays quiet for your own message', () => {
    const mine = { ...message('a', 2_000), fromMe: true };
    expect(worthNotifying(bob, mine, {}, undefined)).toBe(false);
  });
});

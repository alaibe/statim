import { testChat } from './testing/chats';
import { asChatId } from './testing/ids';
import type { ChatMessage, Chat } from './types';

import {
  isCaughtUp,
  isUnread,
  MARKED_UNREAD,
  totalUnread,
  unreadBadge,
  unreadCount,
} from './unread';

const C1 = asChatId('xmtp-c1');
const C2 = asChatId('xmtp-c2');

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  chatId: C1,
  senderId: 'other',
  sentAt: 1_000,
  content: { kind: 'text', text: 'hi' },
  fromMe: false,
  status: 'sent',
  ...overrides,
});

const chat = (overrides: Parameters<typeof testChat>[0] = {}): Chat =>
  testChat({ title: 'Alice', lastMessage: message(), ...overrides });

describe('isUnread', () => {
  it('is unread when the last message arrived after it was read', () => {
    expect(isUnread(chat(), { [C1]: 500 })).toBe(true);
  });

  it('is read once opened after the message', () => {
    expect(isUnread(chat(), { [C1]: 1_500 })).toBe(false);
  });

  it('treats a never-opened chat with a message as unread', () => {
    expect(isUnread(chat(), {})).toBe(true);
  });

  it('never counts your own message, because sending is reading', () => {
    expect(isUnread(chat({ lastMessage: message({ fromMe: true }) }), {})).toBe(false);
  });

  it('ignores membership changes, which are not something to read', () => {
    const system = message({ content: { kind: 'system', text: '1 joined' } });
    expect(isUnread(chat({ lastMessage: system }), {})).toBe(false);
  });

  it('is not unread when there are no messages at all', () => {
    expect(isUnread(chat({ lastMessage: undefined }), {})).toBe(false);
  });

  it('trusts the protocol’s count when no message can be previewed', () => {
    expect(isUnread(chat({ lastMessage: undefined, unreadCount: 2 }), {})).toBe(true);
    expect(unreadBadge(chat({ lastMessage: undefined, unreadCount: 2 }), 0)).toBe(2);
  });

  it('can be manually marked unread after sending', () => {
    expect(isUnread(chat({ lastMessage: message({ fromMe: true }) }), { [C1]: -1 })).toBe(true);
    expect(unreadCount([message()], -1)).toBe(0);
  });

  it('uses a protocol count when available while preserving a local read', () => {
    const c = chat({ unreadCount: 3 });
    expect(isUnread(c, {})).toBe(true);
    expect(isUnread(c, { [C1]: 1_500 })).toBe(false);
    expect(isUnread(chat({ unreadCount: 0 }), {})).toBe(false);
  });
});

describe('totalUnread', () => {
  it('counts chats, not messages, because that is what a badge means', () => {
    const chats = [
      chat({ id: 'xmtp-c1', lastMessage: message({ sentAt: 1_000 }) }),
      chat({ id: 'xmtp-c2', lastMessage: message({ sentAt: 2_000 }) }),
      chat({ id: 'xmtp-c3', lastMessage: message({ fromMe: true, sentAt: 3_000 }) }),
    ];
    expect(totalUnread(chats, { [C1]: 5_000 }, {})).toBe(1);
  });

  it('leaves muted and blocked chats out', () => {
    const chats = [
      chat({ id: 'xmtp-c1' }),
      chat({ id: 'xmtp-c2' }),
      chat({ id: 'xmtp-c3', blocked: true }),
    ];
    expect(totalUnread(chats, {}, { [C2]: { muted: true } })).toBe(1);
  });
});

describe('unreadCount', () => {
  it('counts what others sent since the chat was read, by the same rule as isUnread', () => {
    const messages = [
      message({ id: 'old', sentAt: 500 }),
      message({ id: 'new', sentAt: 1_500 }),
      message({ id: 'mine', sentAt: 1_600, fromMe: true }),
      message({ id: 'system', sentAt: 1_700, content: { kind: 'system', text: 'joined' } }),
      message({ id: 'newer', sentAt: 1_800 }),
    ];
    expect(unreadCount(messages, 1_000)).toBe(2);
    expect(unreadCount(messages, 2_000)).toBe(0);
  });
});

describe('unreadBadge', () => {
  it('prefers the protocol count, falls back to loaded messages, and is empty once caught up', () => {
    const c = chat({ lastMessage: message({ sentAt: 2_000 }) });
    expect(unreadBadge({ ...c, unreadCount: 7 }, 1_000)).toBe(7);
    expect(unreadBadge(c, 1_000, [message({ sentAt: 1_500 }), message({ sentAt: 2_000 })])).toBe(2);
    expect(unreadBadge({ ...c, unreadCount: 7 }, 2_000)).toBe(0);
  });

  it('shows a dot, not a number, for a chat marked unread by hand', () => {
    const c = chat({ unreadCount: 3 });
    expect(unreadBadge(c, MARKED_UNREAD)).toBe(0);
    expect(isUnread(c, { [C1]: MARKED_UNREAD })).toBe(true);
    expect(isCaughtUp(MARKED_UNREAD, c.lastMessage)).toBe(false);
  });
});

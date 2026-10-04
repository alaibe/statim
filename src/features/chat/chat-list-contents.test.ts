import { testChat } from '@/core/messaging/testing/chats';
import type { Chat, ChatMessage } from '@/core/messaging/types';

import { chatListContents } from './chat-list-contents';

function unread(over: Parameters<typeof testChat>[0]): Chat {
  const chat = testChat({ ...over, unreadCount: 1 });
  const lastMessage: ChatMessage = {
    id: 'm1',
    chatId: chat.id,
    senderId: 'them',
    sentAt: 5,
    content: { kind: 'text', text: 'hi' },
    fromMe: false,
    status: 'sent',
  };
  return { ...chat, lastMessage };
}

const XMTP = unread({ id: 'xmtp-a', title: 'Ada' });
const SLACK = unread({ id: 'matrix-b', title: '#general', network: 'slack' });
const NOSTR = testChat({ id: 'nostr-c', title: 'Cy' });

function contents(chats: Chat[], over: Partial<Parameters<typeof chatListContents>[0]> = {}) {
  return chatListContents({
    chats,
    chatPrefs: {},
    readAt: {},
    folder: null,
    filter: 'all',
    query: '',
    held: new Set(),
    titleOf: (c) => c.title,
    ...over,
  });
}

it('keeps XMTP chats at the top and folds every other network', () => {
  const { rows } = contents([XMTP, SLACK, NOSTR]);

  expect(rows.map((row) => (row.kind === 'chat' ? row.chat.id : row.folder))).toEqual([
    'xmtp-a',
    'slack',
    'nostr',
  ]);
});

it('lists unread chats from every folder, and counts them from inside one', () => {
  expect(contents([XMTP, SLACK, NOSTR], { filter: 'unread' }).rows).toEqual([
    { kind: 'chat', chat: XMTP },
    { kind: 'chat', chat: SLACK },
  ]);
  expect(contents([XMTP, SLACK, NOSTR], { folder: 'nostr' }).unreadHere).toBe(2);
});

it('searches past the filter, and shows no filter while searching', () => {
  const { rows, filtering } = contents([XMTP, SLACK, NOSTR], { filter: 'unread', query: 'cy' });

  expect(rows).toEqual([{ kind: 'chat', chat: NOSTR }]);
  expect(filtering).toBe(false);
});

it('lists every chat in Archive whatever the filter', () => {
  const archived = { [NOSTR.id]: { archived: true } };
  const { rows, filtering } = contents([XMTP, NOSTR], {
    chatPrefs: archived,
    folder: 'archive',
    filter: 'groups',
  });

  expect(rows).toEqual([{ kind: 'chat', chat: NOSTR }]);
  expect(filtering).toBe(false);
});

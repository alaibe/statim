import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { useChatStore } from '@/core/messaging/chat-store';
import type { ChatMessage } from '@/core/messaging/types';
import { useChatTimeline } from './use-chat-timeline';
import { asChatId } from '@/core/messaging/testing/ids';
import { testChat } from '@/core/messaging/testing/chats';
import { MARKED_UNREAD } from '@/core/messaging/unread';

jest.mock('expo-observe', () => ({ useObserve: () => ({ markInteractive: () => {} }) }));

beforeEach(() => useChatStore.setState(useChatStore.getInitialState(), true));

const message = (id: string, threadRoot?: string): ChatMessage => ({
  id,
  chatId: asChatId('xmtp-chat'),
  senderId: 'me',
  sentAt: 1,
  content: { kind: 'text', text: id },
  fromMe: true,
  status: 'sent',
  threadRoot,
});

function Probe({ thread }: { thread?: string }) {
  const timeline = useChatTimeline(asChatId('xmtp-chat'), thread, undefined, true);
  return createElement('probe', {
    ids: timeline.messages.map((item) => item.id),
    replies: timeline.replyCounts.get('root'),
  });
}

it('shows root messages in the chat and only that root with its replies in a thread', () => {
  useChatStore.setState({
    accountId: null,
    messages: {
      [asChatId('xmtp-chat')]: [message('root'), message('reply', 'root'), message('later')],
    },
    messageHistory: {},
    readAt: {},
  });

  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(Probe));
  });
  expect(tree.root.findByType('probe' as never).props).toEqual({
    ids: ['root', 'later'],
    replies: 1,
  });

  act(() => tree.update(createElement(Probe, { thread: 'root' })));
  expect(tree.root.findByType('probe' as never).props.ids).toEqual(['root', 'reply']);
  act(() => tree.unmount());
});

it('marks the chat read only when something arrived since it was last read', () => {
  const markRead = jest.fn(async () => {});
  const fromParticipant = (id: string, sentAt: number): ChatMessage => ({
    ...message(id),
    senderId: 'other',
    fromMe: false,
    sentAt,
  });
  useChatStore.setState({
    accountId: null,
    messages: { [asChatId('xmtp-chat')]: [fromParticipant('seen', 5)] },
    messageHistory: {},
    readAt: { [asChatId('xmtp-chat')]: 10 },
    markRead,
  });

  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(Probe));
  });
  expect(markRead).not.toHaveBeenCalled();

  act(() =>
    useChatStore.setState({
      messages: {
        [asChatId('xmtp-chat')]: [
          fromParticipant('seen', 5),
          { ...fromParticipant('joined', 15), content: { kind: 'system', text: 'joined' } },
        ],
      },
    })
  );
  expect(markRead).not.toHaveBeenCalled();

  act(() =>
    useChatStore.setState({
      messages: {
        [asChatId('xmtp-chat')]: [fromParticipant('seen', 5), fromParticipant('new', 20)],
      },
    })
  );
  expect(markRead).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('marks the chat read when its protocol reports unread messages', () => {
  const markRead = jest.fn(async () => {});
  useChatStore.setState({
    accountId: null,
    chats: [testChat({ id: 'xmtp-chat', unreadCount: 0 })],
    messages: {},
    messageHistory: {},
    readAt: {},
    markRead,
  });

  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(Probe));
  });
  expect(markRead).not.toHaveBeenCalled();

  act(() => useChatStore.setState({ chats: [testChat({ id: 'xmtp-chat', unreadCount: 3 })] }));
  expect(markRead).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('does not resend receipts for a stale protocol count or a media update', () => {
  const id = asChatId('xmtp-chat');
  const markRead = jest.fn(async () => {});
  const seen = { ...message('seen'), sentAt: 5, fromMe: false };
  const chat = testChat({ id, lastMessage: seen, unreadCount: 3 });
  useChatStore.setState({
    chats: [chat],
    messages: { [id]: [seen] },
    readAt: { [id]: 10 },
    markRead,
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(Probe));
  });
  act(() =>
    useChatStore.setState({
      chats: [{ ...chat, typing: true }],
      messages: { [id]: [{ ...seen, content: { kind: 'image', uri: 'file:///downloaded.jpg' } }] },
    })
  );
  expect(markRead).not.toHaveBeenCalled();
  act(() => useChatStore.setState({ readAt: { [id]: MARKED_UNREAD } }));
  expect(markRead).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

it('reads a streamed message while the protocol count is still zero', () => {
  const id = asChatId('xmtp-chat');
  const markRead = jest.fn(async () => {});
  const incoming = { ...message('new'), sentAt: 20, fromMe: false };
  useChatStore.setState({
    chats: [testChat({ id, lastMessage: incoming, unreadCount: 0 })],
    messages: { [id]: [incoming] },
    readAt: { [id]: 10 },
    markRead,
  });
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(createElement(Probe));
  });
  expect(markRead).toHaveBeenCalledTimes(1);
  act(() => tree.unmount());
});

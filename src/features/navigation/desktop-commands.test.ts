import { useChatStore } from '@/core/messaging/chat-store';
import type { Chat, ChatId } from '@/core/messaging/types';
import { useChatListStore } from '@/features/chat/chat-list-store';

import { useChatHistory } from './chat-history';
import { runCommand } from './desktop-commands';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (href: string) => mockPush(href) } }));

const mockOpenTab = jest.fn();
const mockOpenChat = jest.fn();
jest.mock('./open', () => ({
  openTab: (href: string) => mockOpenTab(href),
  openChat: (id: string) => mockOpenChat(id),
}));

const IN_CHAT = ['chat', '[id]'];
const ON_CONTACTS = ['(tabs)', '(contacts)', 'contacts'];

beforeEach(() => {
  mockPush.mockClear();
  mockOpenTab.mockClear();
  mockOpenChat.mockClear();
  useChatListStore.setState({ folder: null, filter: 'all' });
});

describe('desktop commands', () => {
  it('apply a filter to the main list without leaving the open chat', () => {
    useChatListStore.setState({ folder: 'archive' });

    runCommand('filter-dms', IN_CHAT, 'xmtp-abc');

    expect(useChatListStore.getState()).toMatchObject({ folder: null, filter: 'dms' });
    expect(mockOpenTab).not.toHaveBeenCalled();
  });

  it('open a folder from another tab, dropping a filter that spans folders', () => {
    useChatListStore.setState({ filter: 'mentions' });

    runCommand('archive', ON_CONTACTS);

    expect(useChatListStore.getState()).toMatchObject({ folder: 'archive', filter: 'all' });
    expect(mockOpenTab).toHaveBeenCalledWith('/chats');
  });

  it('search the open chat, and do nothing while search is already open', () => {
    runCommand('find', IN_CHAT, 'xmtp-abc');
    runCommand('find', ['search']);

    expect(mockPush.mock.calls).toEqual([['/search?chatId=xmtp-abc']]);
  });

  it('go back to the chat opened before, and open one from History', () => {
    const [a, b] = ['xmtp-a', 'xmtp-b'] as ChatId[];
    useChatStore.setState({ chats: [{ id: a }, { id: b }] as Chat[] });
    useChatHistory.setState({ back: [], current: null, forward: [], recent: [] });
    useChatHistory.getState().visit(a);
    useChatHistory.getState().visit(b);

    runCommand('back', IN_CHAT, b);
    runCommand('chat:xmtp-b', IN_CHAT, a);

    expect(mockOpenChat.mock.calls).toEqual([[a], [b]]);
  });

  it('ignore a command they do not know', () => {
    runCommand('page:nope', IN_CHAT);

    expect(mockPush).not.toHaveBeenCalled();
    expect(mockOpenTab).not.toHaveBeenCalled();
    expect(useChatListStore.getState()).toMatchObject({ folder: null, filter: 'all' });
  });
});

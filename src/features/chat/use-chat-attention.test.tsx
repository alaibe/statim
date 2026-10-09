import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { assistanceLines, replyNeeded } from '@/core/ai/chat-assistance';
import type { AiConfig } from '@/core/ai/config';
import { useChatStore } from '@/core/messaging/chat-store';
import { testChat } from '@/core/messaging/testing/chats';
import { asChatId } from '@/core/messaging/testing/ids';
import type { Chat, ChatMessage } from '@/core/messaging/types';
import { useChatAttention } from './use-chat-attention';

jest.mock('@/core/ai/chat-assistance', () => ({
  ...jest.requireActual('@/core/ai/chat-assistance'),
  assistanceLines: jest.fn(),
  replyNeeded: jest.fn(),
}));

const incoming: ChatMessage = {
  id: 'm',
  chatId: asChatId('xmtp-c1'),
  fromMe: false,
  senderId: 'ann',
  sentAt: 1,
  status: 'sent',
  content: { kind: 'text', text: 'Coming?' },
};
const waiting = testChat({ lastMessage: incoming });
const config: AiConfig = { source: 'auto', model: '', url: '', replyBadges: true };
let tree: ReactTestRenderer;
const badge = () => tree.root.findByType('probe' as never).props.badge;
function Probe({ chat = waiting, enabled = true }: { chat?: Chat; enabled?: boolean }) {
  return createElement('probe', { badge: useChatAttention(chat, enabled ? config : undefined) });
}

beforeEach(() => {
  jest.clearAllMocks();
  useChatStore.setState({ ...useChatStore.getInitialState(), accountId: 'a' }, true);
  jest.mocked(assistanceLines).mockResolvedValue([]);
  jest.mocked(replyNeeded).mockResolvedValue(true);
});
afterEach(() => act(() => tree?.unmount()));

it('only checks an opted-in visible row and clears the badge when the user replies', async () => {
  await act(async () => {
    tree = create(createElement(Probe, { enabled: false }));
  });
  expect(replyNeeded).not.toHaveBeenCalled();
  await act(async () => tree.update(createElement(Probe)));
  expect(badge()).toBe('reply');
  const answered = testChat({ lastMessage: { ...incoming, id: 'sent', fromMe: true } });
  await act(async () => tree.update(createElement(Probe, { chat: answered })));
  expect(badge()).toBeNull();
});

it('reads nothing for a chat whose last message is the user’s own', async () => {
  const answered = testChat({ lastMessage: { ...incoming, fromMe: true } });
  await act(async () => {
    tree = create(createElement(Probe, { chat: answered }));
  });
  expect(assistanceLines).not.toHaveBeenCalled();
  expect(useChatStore.getState().messageHistory).toEqual({});
});

it('keeps a decided badge without asking again when the row scrolls back into view', async () => {
  await act(async () => {
    tree = create(createElement(Probe));
  });
  await act(async () => tree.update(createElement(Probe, { enabled: false })));
  await act(async () => tree.update(createElement(Probe)));
  expect(assistanceLines).toHaveBeenCalledTimes(1);
  expect(badge()).toBe('reply');
});

it('drops an in-flight badge when the row is hidden or disabled', async () => {
  let finish!: (needed: boolean) => void;
  jest.mocked(replyNeeded).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await act(async () => {
    tree = create(createElement(Probe));
  });
  await act(async () => tree.update(createElement(Probe, { enabled: false })));
  await act(async () => finish(true));
  expect(badge()).toBeNull();
});

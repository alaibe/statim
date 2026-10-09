import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { useIsFocused } from 'expo-router';

import { recommendAction } from '@/core/ai/chat-assistance';
import { useAiConfig } from '@/core/ai/use-config';
import { useChatStore } from '@/core/messaging/chat-store';
import { asChatId } from '@/core/messaging/testing/ids';
import type { ChatMessage } from '@/core/messaging/types';
import { useSuggestedAction } from './use-suggested-action';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn() }));
jest.mock('@/core/ai/use-config', () => ({ useAiConfig: jest.fn() }));
jest.mock('@/core/ai/chat-assistance', () => ({
  ...jest.requireActual('@/core/ai/chat-assistance'),
  recommendAction: jest.fn(),
}));
const id = asChatId('xmtp-chat');
const incoming: ChatMessage = {
  id: 'm',
  chatId: id,
  fromMe: false,
  senderId: 'ann',
  sentAt: 1,
  status: 'sent',
  content: { kind: 'text', text: 'Bonjour !' },
};
let tree: ReactTestRenderer;
function Probe({ available = true }: { available?: boolean }) {
  return createElement('probe', { action: useSuggestedAction(id, available) });
}
const action = () => tree.root.findByType('probe' as never).props.action;
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useIsFocused).mockReturnValue(true);
  jest
    .mocked(useAiConfig)
    .mockReturnValue({ source: 'auto', model: '', url: '', suggestActions: true });
  jest.mocked(recommendAction).mockResolvedValue('translate');
  useChatStore.setState(
    {
      ...useChatStore.getInitialState(),
      accountId: 'a',
      messages: { [id]: [incoming] },
      messageHistory: { [id]: { loading: false, hasOlder: false } },
    },
    true
  );
});
afterEach(() => act(() => tree?.unmount()));

it.each(['disabled', 'blurred', 'draft'])('does not check actions when %s', async (reason) => {
  if (reason === 'disabled')
    jest.mocked(useAiConfig).mockReturnValue({ source: 'auto', model: '', url: '' });
  if (reason === 'blurred') jest.mocked(useIsFocused).mockReturnValue(false);
  await act(async () => {
    tree = create(createElement(Probe, { available: reason !== 'draft' }));
  });
  expect(recommendAction).not.toHaveBeenCalled();
});

it('discards a delayed recommendation if the user starts composing', async () => {
  let finish!: (value: 'translate') => void;
  jest.mocked(recommendAction).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await act(async () => {
    tree = create(createElement(Probe));
  });
  await act(async () => tree.update(createElement(Probe, { available: false })));
  await act(async () => finish('translate'));
  expect(action()).toBeNull();
});

it('shows a recommendation and removes it when opted out', async () => {
  await act(async () => {
    tree = create(createElement(Probe));
  });
  expect(action()).toBe('translate');
  jest.mocked(useAiConfig).mockReturnValue(undefined);
  await act(async () => tree.update(createElement(Probe)));
  expect(action()).toBeNull();
});

it('does not ask again when the user sends a message', async () => {
  await act(async () => {
    tree = create(createElement(Probe));
  });
  const reply: ChatMessage = {
    ...incoming,
    fromMe: true,
    senderId: 'me',
    content: { kind: 'text', text: 'Hi' },
  };
  for (const sent of [
    { ...reply, id: 'pending:1', status: 'sending' as const },
    { ...reply, id: 'sent-1' },
  ]) {
    await act(async () => useChatStore.setState({ messages: { [id]: [incoming, sent] } }));
  }
  expect(recommendAction).toHaveBeenCalledTimes(1);
  expect(action()).toBe('translate');
});

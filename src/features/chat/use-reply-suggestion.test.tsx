import { act, createElement } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { useIsFocused } from 'expo-router';

import { loadAiConfig, loadTypesafeKey } from '@/core/ai/config';
import { resolveProvider } from '@/core/ai/providers';
import { needsReply } from '@/core/ai/reply-decision';
import { useAppearanceStore } from '@/core/app/appearance';
import { linesFromMessages } from '@/core/messaging/chat-lines';
import { useChatStore } from '@/core/messaging/chat-store';
import { draftKey } from '@/core/messaging/drafts';
import { asChatId } from '@/core/messaging/testing/ids';
import type { ChatId, ChatMessage } from '@/core/messaging/types';
import { useReplySuggestion } from './use-reply-suggestion';

jest.mock('expo-router', () => ({ useIsFocused: jest.fn(() => true) }));
jest.mock('@/core/ai/config', () => ({ loadAiConfig: jest.fn(), loadTypesafeKey: jest.fn() }));
jest.mock('@/core/ai/providers', () => ({ resolveProvider: jest.fn() }));
jest.mock('@/core/ai/reply-decision', () => ({ needsReply: jest.fn() }));
jest.mock('@/core/messaging/chat-lines', () => ({
  ...jest.requireActual('@/core/messaging/chat-lines'),
  linesFromMessages: jest.fn(),
}));

const id = asChatId('xmtp-chat');
const incoming: ChatMessage = {
  id: 'incoming',
  chatId: id,
  senderId: 'ann',
  sentAt: 1,
  fromMe: false,
  content: { kind: 'text', text: 'Are you coming?' },
  status: 'sent',
};
const lines = [{ from: 'Ann', fromMe: false, text: 'Are you coming?', described: false }];
const complete = jest.fn();
let tree: ReactTestRenderer;
const result = () =>
  tree.root.findByType('probe' as never).props as ReturnType<typeof useReplySuggestion>;

function Probe({ chatId = id, available = true }: { chatId?: ChatId; available?: boolean }) {
  return createElement('probe', useReplySuggestion(chatId, available));
}

async function mount(props: { available?: boolean } = {}) {
  await act(async () => {
    tree = create(createElement(Probe, props));
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(useIsFocused).mockReturnValue(true);
  useChatStore.setState(
    {
      ...useChatStore.getInitialState(),
      accountId: 'account',
      messages: { [id]: [incoming] },
      messageHistory: { [id]: { loading: false, hasOlder: false } },
    },
    true
  );
  useAppearanceStore.setState({ accountId: 'account', aiInChats: true });
  jest
    .mocked(loadAiConfig)
    .mockResolvedValue({ source: 'auto', url: '', model: '', suggestOnOpen: true });
  jest.mocked(loadTypesafeKey).mockResolvedValue('jev-key');
  jest.mocked(needsReply).mockResolvedValue(true);
  jest.mocked(linesFromMessages).mockResolvedValue(lines);
  complete.mockResolvedValue('What time?');
  jest
    .mocked(resolveProvider)
    .mockResolvedValue({ label: 'Local model', maxInputChars: 10_000, complete });
});

afterEach(() => {
  if (tree) act(() => tree.unmount());
});

it('asks Jev before preparing a reply and leaves the composer untouched', async () => {
  await mount();
  expect(needsReply).toHaveBeenCalledWith(lines, 'jev-key');
  expect(result().suggestion).toEqual({
    status: 'ready',
    text: 'What time?',
    label: 'Local model',
  });
  expect(useChatStore.getState().drafts).toEqual({});
  expect(jest.mocked(needsReply).mock.invocationCallOrder[0]).toBeLessThan(
    complete.mock.invocationCallOrder[0]
  );
});

it('strips the quotes a model puts around its reply', async () => {
  complete.mockResolvedValue('"What time?"');
  await mount();
  expect(result().suggestion).toMatchObject({ status: 'ready', text: 'What time?' });
});

it('keeps a decided reply without asking again when older messages load', async () => {
  await mount();
  for (const loading of [true, false]) {
    await act(async () => {
      useChatStore.setState({ messageHistory: { [id]: { loading, hasOlder: true } } });
    });
  }
  expect(needsReply).toHaveBeenCalledTimes(1);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(result().suggestion?.status).toBe('ready');
});

it('does not generate a reply when Jev says none is needed', async () => {
  jest.mocked(needsReply).mockResolvedValue(false);
  await mount();
  expect(complete).not.toHaveBeenCalled();
  expect(result().suggestion).toBeNull();
});

it.each(['off', 'unfocused', 'draft', 'outgoing', 'loading', 'unavailable'])(
  'skips %s chats',
  async (reason) => {
    if (reason === 'off') useAppearanceStore.setState({ aiInChats: false });
    if (reason === 'unfocused') jest.mocked(useIsFocused).mockReturnValue(false);
    if (reason === 'draft') useChatStore.setState({ drafts: { [draftKey(id)]: 'My draft' } });
    if (reason === 'outgoing')
      useChatStore.setState({ messages: { [id]: [{ ...incoming, fromMe: true }] } });
    if (reason === 'loading')
      useChatStore.setState({ messageHistory: { [id]: { loading: true, hasOlder: false } } });
    await mount({ available: reason !== 'unavailable' });
    expect(needsReply).not.toHaveBeenCalled();
  }
);

it('does not contact TypeSafe until automatic suggestions are enabled', async () => {
  jest.mocked(loadAiConfig).mockResolvedValue({ source: 'auto', url: '', model: '' });
  await mount();
  expect(needsReply).not.toHaveBeenCalled();
});

it.each(['typing', 'account', 'chat', 'dismiss', 'outgoing', 'disable', 'blur'])(
  'discards a delayed decision after %s',
  async (change) => {
    let finish!: (value: boolean) => void;
    jest.mocked(needsReply).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await mount();
    await act(async () => {
      if (change === 'typing')
        useChatStore.setState({ drafts: { [draftKey(id)]: 'My own words' } });
      if (change === 'account') useChatStore.setState({ accountId: 'other' });
      if (change === 'chat') tree.update(createElement(Probe, { chatId: asChatId('xmtp-other') }));
      if (change === 'dismiss') result().dismiss();
      if (change === 'outgoing')
        useChatStore.setState({
          messages: { [id]: [incoming, { ...incoming, id: 'sent', fromMe: true }] },
        });
      if (change === 'disable') useAppearanceStore.setState({ aiInChats: false });
      if (change === 'blur') {
        jest.mocked(useIsFocused).mockReturnValue(false);
        tree.update(createElement(Probe));
      }
    });
    await act(async () => {
      finish(true);
    });
    expect(complete).not.toHaveBeenCalled();
    expect(result().suggestion).toBeNull();
  }
);

it('discards a generated reply if the user starts typing', async () => {
  let finish!: (value: string) => void;
  complete.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await mount();
  await act(async () => {
    useChatStore.setState({ drafts: { [draftKey(id)]: 'Keep this' } });
  });
  await act(async () => {
    finish('Too late');
  });
  expect(result().suggestion).toBeNull();
  expect(useChatStore.getState().drafts[draftKey(id)]).toBe('Keep this');
});

it('shows errors without generating a reply', async () => {
  jest.mocked(needsReply).mockRejectedValue(new Error('TypeSafe is unavailable'));
  await mount();
  expect(result().suggestion).toEqual({ status: 'error', text: 'TypeSafe is unavailable' });
  expect(complete).not.toHaveBeenCalled();
});

it('ignores reactions and private cards, but checks a new incoming message', async () => {
  await mount();
  await act(async () => {
    useChatStore.setState({
      messages: {
        [id]: [
          { ...incoming, reactions: { '👍': ['me'] } },
          { ...incoming, id: 'private', privateToMe: true },
          { ...incoming, id: 'system', content: { kind: 'system', text: 'joined' } },
          { ...incoming, id: 'thread', threadRoot: 'root' },
        ],
      },
    });
  });
  expect(needsReply).toHaveBeenCalledTimes(1);
  expect(result().suggestion?.status).toBe('ready');
  await act(async () => {
    useChatStore.setState({ messages: { [id]: [incoming, { ...incoming, id: 'next' }] } });
  });
  expect(needsReply).toHaveBeenCalledTimes(2);
});

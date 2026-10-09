import { peekMessages, useChatStore } from '@/core/messaging/chat-store';
import { testChat } from '@/core/messaging/testing/chats';
import { asChatId } from '@/core/messaging/testing/ids';
import { assistanceLines, canAssist, clearDecisions, replyNeeded } from './chat-assistance';
import { loadTypesafeKey } from './config';
import { needsReply } from './reply-decision';

jest.mock('@/core/messaging/chat-store', () => ({
  ...jest.requireActual('@/core/messaging/chat-store'),
  peekMessages: jest.fn(),
}));
jest.mock('./config', () => ({ loadTypesafeKey: jest.fn() }));
jest.mock('./reply-decision', () => ({ needsReply: jest.fn() }));

const id = asChatId('xmtp-chat');
const lines = [{ from: 'Ann', fromMe: false, text: 'Are you coming?', described: false }];

beforeEach(() => {
  jest.resetAllMocks();
  clearDecisions();
  useChatStore.setState({ accountId: 'a' });
  jest.mocked(loadTypesafeKey).mockResolvedValue('key');
  jest.mocked(needsReply).mockResolvedValue(true);
});

it('shares an in-flight decision between the list and composer, then invalidates changed text', async () => {
  const answers = await Promise.all([replyNeeded('a', id, lines), replyNeeded('a', id, lines)]);
  expect(answers).toEqual([true, true]);
  expect(needsReply).toHaveBeenCalledTimes(1);
  await replyNeeded('a', id, [{ ...lines[0], text: 'Actually, never mind.' }]);
  expect(needsReply).toHaveBeenCalledTimes(2);
});

it('does not reuse an error or a cleared decision', async () => {
  jest.mocked(needsReply).mockRejectedValueOnce(new Error('offline'));
  await expect(replyNeeded('a', id, lines)).rejects.toThrow('offline');
  await replyNeeded('a', id, lines);
  clearDecisions();
  await replyNeeded('a', id, lines);
  expect(needsReply).toHaveBeenCalledTimes(3);
});

it('makes no request after cancellation while the key is loading', async () => {
  const controller = new AbortController();
  const result = replyNeeded('a', id, lines, controller.signal);
  controller.abort();
  expect(await result).toBe(false);
  expect(needsReply).not.toHaveBeenCalled();
});

it('assists an accepted chat where the user can write', () => {
  expect(canAssist(testChat())).toBe(true);
});

it.each([
  ['a request', { consent: 'request' }],
  ['a declined chat', { consent: 'declined' }],
  ['a blocked chat', { blocked: true }],
  ['a channel', { kind: 'channel' }],
  ['a read-only chat', { canSend: false }],
  ['a local bot chat', { id: 'local-statim' }],
] as const)('does not assist %s', (_, overrides) => {
  expect(canAssist(testChat(overrides))).toBe(false);
});

it('reads a chat that is not open without keeping its messages', async () => {
  jest.mocked(peekMessages).mockResolvedValue([
    {
      id: 'm',
      chatId: id,
      senderId: 'ann',
      sentAt: 1,
      fromMe: false,
      status: 'sent',
      content: { kind: 'text', text: 'Are you coming?' },
    },
  ]);
  expect((await assistanceLines(id)).map((line) => line.text)).toEqual(['Are you coming?']);
  expect(peekMessages).toHaveBeenCalledWith(id, 50);
  expect(useChatStore.getState().messages[id]).toBeUndefined();
});

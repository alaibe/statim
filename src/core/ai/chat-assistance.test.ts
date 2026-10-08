import { useChatStore } from '@/core/messaging/chat-store';
import { testChat } from '@/core/messaging/testing/chats';
import { asChatId } from '@/core/messaging/testing/ids';
import { canAssist, replyNeeded } from './chat-assistance';
import { loadTypesafeKey } from './config';
import { needsReply } from './reply-decision';

jest.mock('./config', () => ({ loadTypesafeKey: jest.fn() }));
jest.mock('./reply-decision', () => ({ needsReply: jest.fn() }));

const id = asChatId('xmtp-chat');
const lines = [{ from: 'Ann', fromMe: false, text: 'Are you coming?', described: false }];

beforeEach(() => {
  jest.resetAllMocks();
  useChatStore.setState({ accountId: null });
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

it('does not reuse an error or a decision from a previous account session', async () => {
  jest.mocked(needsReply).mockRejectedValueOnce(new Error('offline'));
  await expect(replyNeeded('a', id, lines)).rejects.toThrow('offline');
  await replyNeeded('a', id, lines);
  useChatStore.setState({ accountId: 'b' });
  useChatStore.setState({ accountId: 'a' });
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

it('only assists accepted chats where the user can write', () => {
  expect(canAssist(testChat())).toBe(true);
  for (const chat of [
    testChat({ consent: 'request' }),
    testChat({ consent: 'declined' }),
    testChat({ blocked: true }),
    testChat({ kind: 'channel' }),
    testChat({ canSend: false }),
    testChat({ id: 'local-statim' }),
  ])
    expect(canAssist(chat)).toBe(false);
});

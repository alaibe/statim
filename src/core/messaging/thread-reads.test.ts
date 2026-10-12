import { asChatId } from './testing/ids';
import { keepThreadReads, newReplyCounts, withThreadRead } from './thread-reads';
import type { ChatMessage } from './types';
import { MARKED_UNREAD } from './unread';

const id = asChatId('matrix-room');

const reply = (messageId: string, threadRoot: string, sentAt: number, fromMe = false) =>
  ({
    id: messageId,
    chatId: id,
    senderId: fromMe ? 'me' : 'other',
    sentAt,
    content: { kind: 'text', text: messageId },
    fromMe,
    status: 'sent',
    threadRoot,
  }) satisfies ChatMessage;

it('keeps the first read time a chat had, and none it never had', () => {
  const kept = keepThreadReads({}, id, 100);
  expect(kept[id]).toEqual({ since: 100, threads: {} });
  expect(keepThreadReads(kept, id, 200)).toBe(kept);
  expect(keepThreadReads({}, id, undefined)).toEqual({});
  expect(keepThreadReads({}, id, MARKED_UNREAD)).toEqual({});
});

it('counts replies newer than their thread was read, from others only', () => {
  const messages = [
    reply('old', 'a', 50),
    reply('new', 'a', 150),
    reply('mine', 'a', 160, true),
    reply('opened', 'b', 150),
    reply('after', 'b', 300),
  ];
  const reads = withThreadRead(keepThreadReads({}, id, 100), id, 'b', 400, 200)[id];

  expect(newReplyCounts(messages, reads, 400)).toEqual(
    new Map([
      ['a', 1],
      ['b', 1],
    ])
  );
  expect(newReplyCounts(messages, undefined, 400)).toEqual(new Map());
});

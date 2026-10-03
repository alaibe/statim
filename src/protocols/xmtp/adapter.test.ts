import type { LocalAccount } from 'viem';

import { createAccountStorage } from '@/storage/account';
import { XmtpSession } from './adapter';

const mockBuild = jest.fn();
const mockCreate = jest.fn();

jest.mock('@xmtp/react-native-sdk', () => ({
  Client: {
    build: (...args: unknown[]) => mockBuild(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
  PublicIdentity: function PublicIdentity() {},
  ConsentRecord: function ConsentRecord(
    this: Record<string, string>,
    value: string,
    entryType: string,
    state: string
  ) {
    Object.assign(this, { value, entryType, state });
  },
  ConsentState: {},
  ConversationVersion: { GROUP: 'group', DM: 'dm' },
  Dm: class {},
  Group: class {},
}));

const client = (inboxId: string) => ({
  inboxId,
  publicIdentity: { identifier: '0xabc' },
  conversations: {},
});

it('remembers the inbox id, so the next launch builds the client without the network', async () => {
  const storage = createAccountStorage('xmtp-inbox');
  const options = {
    accountId: 'xmtp-inbox',
    account: { address: '0xabc' } as unknown as LocalAccount,
    dbEncryptionKey: new Uint8Array(32),
    env: 'dev' as const,
    storage,
  };
  mockBuild.mockResolvedValue(client('inbox-1'));

  await XmtpSession.connect(options);
  await XmtpSession.connect(options);

  expect(mockBuild.mock.calls[0][2]).toBeUndefined();
  expect(mockBuild.mock.calls[1][2]).toBe('inbox-1');
  expect(mockCreate).not.toHaveBeenCalled();
});

const DM_TOPIC = '/xmtp/mls/1/g-dm/proto';

const text = (id: string, sentMs: number) => ({
  id,
  topic: DM_TOPIC,
  senderInboxId: 'peer',
  sentNs: sentMs * 1_000_000,
  deliveryStatus: 'PUBLISHED',
  contentTypeId: 'xmtp.org/text:1.0',
  nativeContent: { text: id },
});
const receipt = (id: string, sentMs: number) => ({
  ...text(id, sentMs),
  contentTypeId: 'xmtp.org/readReceipt:1.0',
  nativeContent: { readReceipt: {} },
});

const findConversationByTopic = jest.fn();
const setConsentState = jest.fn();

async function sessionWith(
  conversations: unknown[],
  streamed: unknown[] = [],
  { denied = [], deniedInboxes = [] }: { denied?: unknown[]; deniedInboxes?: string[] } = {}
) {
  findConversationByTopic.mockReset();
  findConversationByTopic.mockImplementation(async (topic: string) =>
    conversations.find((conversation) => (conversation as { topic: string }).topic === topic)
  );
  setConsentState.mockReset();
  mockBuild.mockResolvedValue({
    ...client('me'),
    preferences: {
      inboxIdConsentState: async (inboxId: string) =>
        deniedInboxes.includes(inboxId) ? 'denied' : 'unknown',
      setConsentState,
    },
    conversations: {
      list: async () => conversations,
      listDms: async () => denied,
      findConversation: async (id: string) =>
        [...conversations, ...denied].find((c) => (c as { id: string }).id === id),
      findConversationByTopic,
      streamAllMessages: async (onMessage: (message: unknown) => Promise<void>) => {
        for (const message of streamed) await onMessage(message);
      },
      cancelStreamAllMessages: () => {},
    },
  });
  return XmtpSession.connect({
    accountId: 'xmtp-receipts',
    account: { address: '0xabc' } as unknown as LocalAccount,
    dbEncryptionKey: new Uint8Array(32),
  });
}

const dm = {
  id: 'dm',
  topic: DM_TOPIC,
  version: 'dm',
  createdAt: 1,
  state: 'allowed',
  peerInboxId: async () => 'peer',
  lastMessage: receipt('seen', 3_000),
  messages: async () => [receipt('seen', 3_000), text('hello', 2_000)],
};

it('previews a chat by its newest message, not a read receipt', async () => {
  const [listed] = await (await sessionWith([dm])).listChats();
  expect(listed.lastMessage).toMatchObject({ id: 'hello', content: { text: 'hello' } });
});

it('does not stream read receipts as messages', async () => {
  const received: string[] = [];
  const session = await sessionWith([dm], [receipt('seen', 3_000), text('hello', 2_000)]);
  await session.streamMessages((message) => received.push(message.id));
  expect(received).toEqual(['hello']);
});

it('streams a message into the chat its topic names, without asking the client', async () => {
  const received: { id: string; chatId: string }[] = [];
  const session = await sessionWith([dm], [text('hello', 2_000)]);
  await session.streamMessages(({ id, chatId }) => received.push({ id, chatId }));
  expect(received).toEqual([{ id: 'hello', chatId: 'dm' }]);
  expect(findConversationByTopic).not.toHaveBeenCalled();
});

it('asks the client for the chat of a topic that names none', async () => {
  const OTHER_TOPIC = '/xmtp/other/dm';
  const received: { id: string; chatId: string }[] = [];
  const session = await sessionWith(
    [{ ...dm, topic: OTHER_TOPIC }],
    [{ ...text('hello', 2_000), topic: OTHER_TOPIC }]
  );
  await session.streamMessages(({ id, chatId }) => received.push({ id, chatId }));
  expect(received).toEqual([{ id: 'hello', chatId: 'dm' }]);
  expect(findConversationByTopic).toHaveBeenCalledWith(OTHER_TOPIC);
});

it('lists a DM blocked by denying its peer, and leaves a declined one out', async () => {
  const blocked = { ...dm, id: 'blocked', state: 'denied', peerInboxId: async () => 'spammer' };
  const declined = { ...dm, id: 'declined', state: 'denied', peerInboxId: async () => 'stranger' };
  const session = await sessionWith([dm], [], {
    denied: [blocked, declined],
    deniedInboxes: ['spammer'],
  });

  const listed = await session.listChats();
  expect(listed.map((chat) => [chat.id, chat.blocked])).toEqual([
    ['dm', undefined],
    ['blocked', true],
  ]);
});

it('blocks by denying the peer inbox as well as the DM, and allows both to unblock', async () => {
  const updateConsent = jest.fn();
  const session = await sessionWith([{ ...dm, updateConsent }]);

  await session.setBlocked('dm' as never, true);
  await session.setBlocked('dm' as never, false);

  expect(setConsentState.mock.calls.map(([record]) => ({ ...record }))).toEqual([
    { value: 'peer', entryType: 'inbox_id', state: 'denied' },
    { value: 'peer', entryType: 'inbox_id', state: 'allowed' },
  ]);
  expect(updateConsent.mock.calls).toEqual([['denied'], ['allowed']]);
});

it('drops what a blocked DM streams, even before the stream hears of the block', async () => {
  const received: string[] = [];
  const session = await sessionWith([{ ...dm, updateConsent: jest.fn() }], [text('hello', 2_000)]);
  await session.setBlocked('dm' as never, true);
  await session.streamMessages((message) => received.push(message.id));
  expect(received).toEqual([]);
});

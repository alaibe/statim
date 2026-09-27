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

async function sessionWith(conversations: unknown[], streamed: unknown[] = []) {
  findConversationByTopic.mockReset();
  findConversationByTopic.mockImplementation(async (topic: string) =>
    conversations.find((conversation) => (conversation as { topic: string }).topic === topic)
  );
  mockBuild.mockResolvedValue({
    ...client('me'),
    conversations: {
      list: async () => conversations,
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

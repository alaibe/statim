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

const client = (inboxId: string, installations = ['this-device']) => ({
  inboxId,
  installationId: 'this-device',
  publicIdentity: { identifier: '0xabc' },
  inboxState: async () => ({ installations: installations.map((id) => ({ id })) }),
  deleteLocalDatabase: jest.fn(),
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

const connectAs = (address: string) =>
  XmtpSession.connect({
    accountId: address,
    account: { address } as unknown as LocalAccount,
    dbEncryptionKey: new Uint8Array(32),
  });

it('starts a new installation when another device revoked this one', async () => {
  const revoked = client('inbox-1', ['other-device']);
  mockBuild.mockResolvedValue(revoked);
  mockCreate.mockReset().mockResolvedValue(client('inbox-1'));

  await connectAs('0xrevoked');

  expect(revoked.deleteLocalDatabase).toHaveBeenCalled();
  expect(mockCreate).toHaveBeenCalled();
});

it('keeps the local database when there is no room to register again', async () => {
  const full = client(
    'inbox-1',
    Array.from({ length: 10 }, (_, i) => `other-${i}`)
  );
  mockBuild.mockResolvedValue(full);
  mockCreate.mockReset();

  await expect(connectAs('0xfull')).rejects.toThrow('inbox is full');

  expect(full.deleteLocalDatabase).not.toHaveBeenCalled();
  expect(mockCreate).not.toHaveBeenCalled();
});

it('keeps this installation when the network cannot say whether it was revoked', async () => {
  const offline = { ...client('inbox-1'), inboxState: () => Promise.reject(new Error('offline')) };
  mockBuild.mockResolvedValue(offline);
  mockCreate.mockReset();

  await connectAs('0xoffline');

  expect(offline.deleteLocalDatabase).not.toHaveBeenCalled();
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
  const found = (conversation: unknown) =>
    conversation && { ...(conversation as object), lastMessage: undefined };
  findConversationByTopic.mockReset();
  findConversationByTopic.mockImplementation(async (topic: string) =>
    found(conversations.find((c) => (c as { topic: string }).topic === topic))
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
        found([...conversations, ...denied].find((c) => (c as { id: string }).id === id)),
      findConversationByTopic,
      streamAllMessages: async (onMessage: (message: unknown) => Promise<void>) => {
        for (const message of streamed) await onMessage(message);
      },
      cancelStreamAllMessages: () => {},
      stream: async () => {},
      cancelStream: () => {},
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

it('marks your messages read up to the newest receipt someone else sent', async () => {
  const [listed] = await (await sessionWith([dm])).listChats();
  expect(listed.readUpTo).toBe(3_000);
});

it('does not count a receipt from another device of your own', async () => {
  const own = { ...receipt('mine', 3_000), senderInboxId: 'me' };
  const mine = { ...dm, lastMessage: own, messages: async () => [own, text('hello', 2_000)] };
  const [listed] = await (await sessionWith([mine])).listChats();
  expect(listed.readUpTo).toBeUndefined();
});

it('announces the chat again when a receipt streams in', async () => {
  const unread = {
    ...dm,
    lastMessage: text('hello', 2_000),
    messages: async () => [text('hello', 2_000)],
  };
  const session = await sessionWith([unread], [receipt('seen', 3_000)]);
  const announced: (number | undefined)[] = [];
  await session.streamChats((chat) => announced.push(chat.readUpTo));
  await session.streamMessages(() => {});
  expect(announced).toEqual([3_000]);
});

it('keeps the preview of a chat a receipt announces again', async () => {
  const unread = {
    ...dm,
    lastMessage: text('hello', 2_000),
    messages: async () => [receipt('seen', 3_000), text('hello', 2_000)],
  };
  const session = await sessionWith([unread], [receipt('seen', 3_000)]);
  const previews: (string | undefined)[] = [];
  await session.streamChats((chat) => previews.push(chat.lastMessage?.id));
  await session.streamMessages(() => {});
  expect(previews).toEqual(['hello']);
});

it('leaves read receipts out of the history of a DM and of a group', async () => {
  const group = { ...dm, id: 'group', version: 'group' };
  const session = await sessionWith([dm, group]);
  for (const id of ['dm', 'group']) {
    const history = await session.getMessages(id as never);
    expect(history.map((message) => message.id)).toEqual(['hello']);
  }
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

const joined = (id: string, sentMs: number) => ({
  ...text(id, sentMs),
  contentTypeId: 'xmtp.org/group_updated:1.0',
  nativeContent: {
    groupUpdated: {
      membersAdded: [{ inboxId: 'peer' }],
      membersRemoved: [],
      metadataFieldsChanged: [],
    },
  },
});

it('leaves who joined out of a DM, in its history, preview and stream', async () => {
  const fresh = {
    ...dm,
    lastMessage: joined('created', 1_000),
    messages: async () => [joined('created', 1_000)],
  };
  const session = await sessionWith([fresh], [joined('created', 1_000), text('hello', 2_000)]);
  const received: string[] = [];

  const [listed] = await session.listChats();
  const history = await session.getMessages('dm' as never);
  await session.streamMessages((message) => received.push(message.id));

  expect(listed.lastMessage).toBeUndefined();
  expect(history).toEqual([]);
  expect(received).toEqual(['hello']);
});

it('keeps who joined in a group', async () => {
  const group = {
    id: 'group',
    topic: '/xmtp/mls/1/g-group/proto',
    version: 'group',
    createdAt: 1,
    state: 'allowed',
    groupName: 'Crew',
    members: async () => [],
    lastMessage: joined('created', 1_000),
    messages: async () => [joined('created', 1_000)],
  };
  const session = await sessionWith([group], [joined('created', 1_000)]);
  const received: string[] = [];

  const [listed] = await session.listChats();
  const history = await session.getMessages('group' as never);
  await session.streamMessages((message) => received.push(message.id));

  const system = { kind: 'system', text: '1 joined' };
  expect(listed.lastMessage?.content).toEqual(system);
  expect(history.map((message) => message.content)).toEqual([system]);
  expect(received).toEqual(['created']);
});

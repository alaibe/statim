import type { LocalAccount } from 'viem';

import { XmtpSession } from './adapter.web';
import type { ProtocolChat } from '@/core/messaging/types';
import { protocolChatId } from '@/core/messaging/namespace';

const mockBuild = jest.fn();

it('rejects accepting or declining an unknown chat', async () => {
  mockBuild.mockResolvedValue({
    inboxId: 'me',
    installationId: 'this-device',
    accountIdentifier: { identifier: '0xabc' },
    isRegistered: async () => true,
    preferences: { fetchInboxState: async () => ({ installations: [{ id: 'this-device' }] }) },
    conversations: { getConversationById: async () => undefined },
  });
  const session = await XmtpSession.connect({
    accountId: 'xmtp-missing',
    account: { address: '0xabc' } as unknown as LocalAccount,
    dbEncryptionKey: new Uint8Array(32),
    env: 'dev',
  });
  const id = protocolChatId('missing');
  await expect(session.setConsent(id, 'accepted')).rejects.toThrow('Chat missing not found');
  await expect(session.setConsent(id, 'declined')).rejects.toThrow('Chat missing not found');
});

jest.mock('@xmtp/browser-sdk', () => {
  const is = (kind: string) => (message: { kind: string }) => message.kind === kind;
  return {
    Client: { build: (...args: unknown[]) => mockBuild(...args) },
    ConsentState: { Unknown: 0, Allowed: 1, Denied: 2 },
    DeliveryStatus: { Failed: 'failed' },
    Dm: class {},
    Group: class {},
    IdentifierKind: { Ethereum: 'ethereum' },
    PermissionLevel: {},
    ReactionAction: { Removed: 'removed' },
    SortDirection: { Descending: 'descending' },
    isAttachment: () => false,
    isGroupUpdated: () => false,
    isReaction: is('reaction'),
    isReadReceipt: is('receipt'),
    isReply: () => false,
    isText: is('text'),
    isTextReply: () => false,
  };
});

const { Group } = jest.requireMock('@xmtp/browser-sdk');

it('lists the reactions the SDK nests under a message, in the order they were sent', async () => {
  const reaction = (action: string, sentMs: number) => ({
    ...message('reaction', 'me', sentMs),
    content: { reference: 'peer-1000', content: '👍', action },
  });
  const group = Object.assign(new Group(), {
    messages: async () => [
      {
        ...message('text', 'peer', 1_000),
        reactions: [reaction('removed', 3_000), reaction('added', 2_000)],
      },
    ],
  });
  mockBuild.mockResolvedValue({
    inboxId: 'me',
    installationId: 'this-device',
    accountIdentifier: { identifier: '0xabc' },
    isRegistered: async () => true,
    preferences: { fetchInboxState: async () => ({ installations: [{ id: 'this-device' }] }) },
    conversations: { getConversationById: async () => group },
  });
  const session = await XmtpSession.connect({
    accountId: 'xmtp-reactions',
    account: { address: '0xabc' } as unknown as LocalAccount,
    dbEncryptionKey: new Uint8Array(32),
    env: 'dev',
  });

  const history = await session.getMessages(protocolChatId('group'));

  expect(history.map(({ id, content }) => ({ id, content }))).toEqual([
    { id: 'peer-1000', content: { kind: 'text', text: 'text' } },
    {
      id: 'me-2000',
      content: { kind: 'reaction', targetId: 'peer-1000', emoji: '👍', action: 'added' },
    },
    {
      id: 'me-3000',
      content: { kind: 'reaction', targetId: 'peer-1000', emoji: '👍', action: 'removed' },
    },
  ]);
});

type Streamed = ReturnType<typeof message>;

const message = (kind: 'text' | 'receipt' | 'reaction', senderInboxId: string, sentMs: number) => ({
  id: `${senderInboxId}-${sentMs}`,
  kind,
  conversationId: 'group',
  senderInboxId,
  sentAtNs: BigInt(sentMs) * 1_000_000n,
  contentType: { typeId: kind },
  content: kind,
  reactions: [] as unknown[],
});

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

const endable = <T>(values: AsyncGenerator<T>) => Object.assign(values, { end: async () => {} });

/** The read marks the group is announced with while `streamed` arrives, one value per task. */
async function announcedWhile(
  streamed: Streamed[],
  {
    first,
    failedLookups = 0,
    recent,
    onChat,
  }: {
    first?: (s: XmtpSession) => unknown;
    failedLookups?: number;
    recent?: Streamed[];
    onChat?: (chat: ProtocolChat) => void;
  } = {}
) {
  let lookups = 0;
  const reads = new Map<string, bigint>();
  let drained = () => {};
  const done = new Promise<void>((resolve) => (drained = resolve));
  const messages = async function* () {
    for (const value of streamed) {
      if (value.kind === 'receipt') reads.set(value.senderInboxId, value.sentAtNs);
      yield value;
      await nextTask();
    }
    drained();
  };
  const group = Object.assign(new Group(), {
    id: 'group',
    name: 'Crew',
    createdAt: new Date(1),
    members: async () => [],
    consentState: async () => 1,
    messages: async () => recent ?? [message('text', 'peer', 1_000)],
    lastReadTimes: async () => new Map(reads),
    sendText: async () => 'sent',
  });
  mockBuild.mockResolvedValue({
    inboxId: 'me',
    installationId: 'this-device',
    accountIdentifier: { identifier: '0xabc' },
    isRegistered: async () => true,
    preferences: { fetchInboxState: async () => ({ installations: [{ id: 'this-device' }] }) },
    conversations: {
      getConversationById: async () => {
        if (++lookups <= failedLookups) throw new Error('database busy');
        return group;
      },
      stream: async () => endable((async function* () {})()),
      streamAllMessages: async () => endable(messages()),
    },
  });
  const session = await XmtpSession.connect({
    accountId: 'xmtp-web',
    account: { address: '0xabc' } as unknown as LocalAccount,
    dbEncryptionKey: new Uint8Array(32),
    env: 'dev',
  });
  await first?.(session);
  const announced: (number | undefined)[] = [];
  await session.streamChats((chat) => {
    announced.push(chat.readUpTo);
    onChat?.(chat);
  });
  await session.streamMessages(() => {});
  await done;
  await nextTask();
  return announced;
}

it('keeps a reaction out of the preview when announcing a chat', async () => {
  const previews: (string | undefined)[] = [];
  await announcedWhile([message('receipt', 'peer', 3_000)], {
    recent: [message('reaction', 'peer', 2_000), message('text', 'peer', 1_000)],
    onChat: (chat) => previews.push(chat.lastMessage?.id),
  });
  expect(previews).toEqual(['peer-1000']);
});

it('announces a group once per message of yours, not once per member who read it', async () => {
  const announced = await announcedWhile([
    message('text', 'me', 2_000),
    message('receipt', 'ann', 3_000),
    message('receipt', 'bob', 3_100),
    message('text', 'me', 4_000),
    message('receipt', 'cat', 5_000),
    message('receipt', 'ann', 5_100),
  ]);
  expect(announced).toEqual([3_000, 5_000]);
});

it('tries again with the next receipt when announcing the chat failed', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const announced = await announcedWhile(
    [
      message('text', 'me', 2_000),
      message('receipt', 'ann', 3_000),
      message('receipt', 'bob', 3_100),
    ],
    { failedLookups: 1 }
  );
  expect(announced).toEqual([3_100]);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

it('announces a receipt for what you just sent from this device', async () => {
  const later = Date.now() + 60_000;
  const announced = await announcedWhile(
    [message('receipt', 'ann', 3_000), message('receipt', 'bob', later)],
    { first: (session) => session.send('group' as never, { kind: 'text', text: 'hi' }) }
  );
  expect(announced).toEqual([3_000, later]);
});

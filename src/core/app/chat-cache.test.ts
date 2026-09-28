import { AccountRuntime, type RuntimeAccount } from './account-runtime';
import { clearChatProjection, useChatStore } from '../messaging/chat-store';
import { InMemoryChatSession } from '../messaging/in-memory-session';
import { InMemoryMessageStore } from '../messaging/message-store';
import { flushWrites, TEST_KEYRING } from '../messaging/testing/store';
import type { LoginState } from '../messaging/protocol';
import type { Chat } from '../messaging/types';
import { PluginRegistry } from '../plugins/registry';
import { createAccountStorage } from '@/storage/account';
import { PROTOCOLS } from '@/protocols';
import { testChat } from '@/core/messaging/testing/chats';
import { asChatId } from '@/core/messaging/testing/ids';

const chat = (id: string, extra: Partial<Chat> = {}): Chat =>
  testChat({ id: `xmtp-${id}`, protocol: 'xmtp', title: id, createdAt: 1_000, ...extra });

function account(store: InMemoryMessageStore, session: () => Promise<InMemoryChatSession>) {
  return {
    accountId: 'cache-account',
    keyring: TEST_KEYRING,
    registry: new PluginRegistry(),
    defaultEnabled: [],
    makeContext: () => {
      throw new Error('No plugins here.');
    },
    createSession: session,
    only: ['xmtp'],
    storage: { ...createAccountStorage('cache-account'), messages: store },
  } satisfies RuntimeAccount;
}

const ids = (protocol = 'xmtp') =>
  useChatStore
    .getState()
    .chats.filter((c) => c.protocol === protocol)
    .map((c) => c.id)
    .sort();

beforeEach(() => clearChatProjection());

describe('the cached chat list', () => {
  it('shows the chats kept last time before the protocol connects', async () => {
    const store = new InMemoryMessageStore();
    await store.cacheChats([chat('kept')], []);
    let connect!: (session: InMemoryChatSession) => void;
    const runtime = new AccountRuntime(PROTOCOLS);

    const running = runtime.synchronize(
      account(store, () => new Promise((resolve) => (connect = resolve)))
    );
    for (let i = 0; i < 5 && ids().length === 0; i++) await flushWrites();
    expect(ids()).toEqual(['xmtp-kept']);

    const session = new InMemoryChatSession();
    session.seedChat({ id: 'kept' });
    connect(session);
    await running;
    await runtime.synchronize(null);
  });

  it('drops a kept chat the protocol no longer lists, once it has listed everything', async () => {
    const store = new InMemoryMessageStore();
    await store.cacheChats([chat('kept'), chat('left')], []);
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'kept' });
    const runtime = new AccountRuntime(PROTOCOLS);

    await runtime.synchronize(account(store, async () => session));
    await flushWrites();

    expect(ids()).toEqual(['xmtp-kept']);
    await runtime.synchronize(null);
  });

  it('keeps every kept chat while the protocol cannot list them all yet', async () => {
    const store = new InMemoryMessageStore();
    await store.cacheChats([chat('kept'), chat('left')], []);
    const session = new InMemoryChatSession();
    session.whenListed = () => new Promise(() => {});
    const runtime = new AccountRuntime(PROTOCOLS);

    await runtime.synchronize(account(store, async () => session));
    await flushWrites();

    expect(ids()).toEqual(['xmtp-kept', 'xmtp-left']);
    await runtime.synchronize(null);
  });

  it('keeps what the protocol listed, without who was typing or online', async () => {
    const store = new InMemoryMessageStore();
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'fresh', online: true, typing: true });
    const runtime = new AccountRuntime(PROTOCOLS);

    await runtime.synchronize(account(store, async () => session));
    await flushWrites();
    session.deliver('fresh', { content: { kind: 'text', text: 'hello' } });
    await runtime.synchronize(null);
    await flushWrites();

    const [kept] = await store.cachedChats();
    expect(kept).toMatchObject({ id: 'xmtp-fresh', lastMessage: { content: { text: 'hello' } } });
    expect(kept).not.toHaveProperty('online');
    expect(kept).not.toHaveProperty('typing');
  });

  it("keeps a protocol's chats while it reconnects", async () => {
    const store = new InMemoryMessageStore();
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'stays' });
    const runtime = new AccountRuntime(PROTOCOLS);

    await runtime.synchronize(account(store, async () => session));
    await flushWrites();
    session.deliver('stays', { content: { kind: 'text', text: 'hello' } });
    await runtime.updateProtocolConfig('cache-account', 'xmtp', {});
    await runtime['transition'];
    await runtime.synchronize(null);
    await flushWrites();

    expect((await store.cachedChats()).map((c) => c.id)).toEqual(['xmtp-stays']);
  });

  it('forgets a protocol that asks to be signed into again', async () => {
    const store = new InMemoryMessageStore();
    await store.cacheChats([chat('kept')], []);
    const session = new InMemoryChatSession();
    session.whenListed = () => new Promise(() => {});
    let login!: (state: LoginState | null) => void;
    Object.assign(session, {
      subscribeLogin: (listener: typeof login) => {
        login = listener;
        return () => {};
      },
    });
    const runtime = new AccountRuntime(PROTOCOLS);

    await runtime.synchronize(account(store, async () => session));
    login({ step: 'phone', prompt: 'Phone number' } as LoginState);
    await flushWrites();

    expect(ids()).toEqual([]);
    expect(await store.cachedChats()).toEqual([]);
    await runtime.synchronize(null);
  });

  it('forgets a protocol that is no longer set up', async () => {
    const store = new InMemoryMessageStore();
    await store.cacheChats(
      [chat('kept', { id: asChatId('xmtp-tg-kept'), protocol: 'telegram' })],
      []
    );
    const runtime = new AccountRuntime(PROTOCOLS);

    await runtime.synchronize({
      ...account(store, async () => new InMemoryChatSession()),
      createSession: undefined,
      only: ['telegram'],
    });

    expect(ids('telegram')).toEqual([]);
    expect(await store.cachedChats()).toEqual([]);
    await runtime.synchronize(null);
  });
});

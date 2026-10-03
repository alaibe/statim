import { useAppearanceStore } from '../app/appearance';
import { SAVED_LOCAL_ID, STATIM_LOCAL_ID } from './bots';
import { mergeChats, useChatStore } from './chat-store';
import { draftKey } from './drafts';
import { InMemoryChatSession } from './in-memory-session';
import { InMemoryMessageStore } from './message-store';
import { protocolChatId } from './namespace';
import { testChat } from './testing/chats';
import { asChatId } from './testing/ids';
import type { ChatMessage, Chat, ProtocolChat } from './types';
import { MARKED_UNREAD } from './unread';
import { accountRuntime } from '@/runtime';
import {
  connectFake,
  disconnectFake,
  flushWrites,
  ns,
  projectTestAccount,
  resetChatStore,
} from './testing/store';

jest.mock('../account/keyring', () => ({
  ...jest.requireActual('../account/keyring'),
  loadOrCreateDbEncryptionKey: async () => new Uint8Array(32),
}));

const connect = (session: InMemoryChatSession) => connectFake(session);

beforeEach(async () => {
  resetChatStore();
});

describe('connecting', () => {
  it('lists chats and reports ready', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1', title: 'Alice' });

    await connect(session);

    expect(useChatStore.getState().status).toBe('ready');
    expect(
      useChatStore
        .getState()
        .chats.filter((c) => c.protocol !== 'local')
        .map((c) => c.id)
    ).toEqual([ns('c1')]);
  });

  it('surfaces a failure instead of hanging in "connecting"', async () => {
    await connectFake(new InMemoryChatSession(), {
      sessionFor: () => {
        throw new Error('network down');
      },
    });

    expect(useChatStore.getState().status).toBe('error');
    expect(useChatStore.getState().error).toBe('network down');
  });
});

describe('message search', () => {
  it('opens stored protocol hits through their namespaced chat', async () => {
    const store = new InMemoryMessageStore();
    projectTestAccount('test-account', store);
    await store.insertMessage(
      {
        id: 'm1',
        chatId: protocolChatId('c1'),
        senderId: 'them',
        sentAt: 1,
        content: { kind: 'text', text: 'needle' },
        fromMe: false,
        status: 'sent',
      },
      {
        id: protocolChatId('c1'),
        protocolId: 'xmtp',
        participants: ['me', 'them'],
        createdAt: 1,
        hidden: false,
      }
    );
    expect((await useChatStore.getState().searchMessages('needle'))[0].chatId).toBe(ns('c1'));
    expect((await useChatStore.getState().searchMessages('needle', ns('c1')))[0].id).toBe('m1');
  });

  it('finds a private note when searching inside its chat', async () => {
    const store = new InMemoryMessageStore();
    projectTestAccount('test-account', store);
    await store.insertMessage({
      id: 'note',
      chatId: ns('c1'),
      senderId: 'me',
      sentAt: 1,
      content: { kind: 'text', text: 'needle to self' },
      fromMe: true,
      status: 'sent',
      privateToMe: true,
    });
    const found = await useChatStore.getState().searchMessages('needle', ns('c1'));
    expect(found.map((message) => message.id)).toEqual(['note']);
  });

  it('combines protocol history with messages already loaded in a chat', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    const search = jest.fn(async () => [
      {
        id: 'older',
        chatId: 'c1',
        senderId: 'them',
        sentAt: 1,
        content: { kind: 'text' as const, text: 'needle before load' },
        fromMe: false,
        status: 'sent' as const,
      },
    ]);
    Object.assign(session, { searchMessages: search });
    await connect(session);
    session.deliver('c1', {
      id: 'loaded',
      sentAt: 2,
      content: { kind: 'text', text: 'needle now' },
    });
    await useChatStore.getState().loadMessages(ns('c1'));

    const found = await useChatStore.getState().searchMessages('needle', ns('c1'));
    expect(search).toHaveBeenCalledWith('needle', 'c1');
    expect(found.map((message) => message.id)).toEqual(['loaded', 'older']);
    expect(found.every((message) => message.chatId === ns('c1'))).toBe(true);
  });
});

describe('sending', () => {
  it('edits and removes a delivered message without moving an older edit to the top', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    const edit = jest.fn(async (_id: string, messageId: string, text: string) => {
      session.deliver('c1', {
        id: messageId,
        sentAt: 1,
        fromMe: true,
        content: { kind: 'text', text },
      });
    });
    const remove = jest.fn().mockResolvedValue(undefined);
    Object.assign(session, { editMessage: edit, deleteMessage: remove });
    await connect(session);
    await useChatStore.getState().loadMessages(ns('c1'));
    session.deliver('c1', {
      id: 'older',
      sentAt: 1,
      fromMe: true,
      content: { kind: 'text', text: 'old' },
    });
    session.deliver('c1', { id: 'newer', sentAt: 2, content: { kind: 'text', text: 'latest' } });

    await useChatStore.getState().editMessage(ns('c1'), 'older', 'changed');
    expect(edit).toHaveBeenCalledWith('c1', 'older', 'changed');
    expect(useChatStore.getState().messages[ns('c1')][0].content).toEqual({
      kind: 'text',
      text: 'changed',
    });
    expect(useChatStore.getState().chats.find((c) => c.id === ns('c1'))?.lastMessage?.id).toBe(
      'newer'
    );

    await useChatStore.getState().deleteMessage(ns('c1'), 'newer', true);
    expect(remove).toHaveBeenCalledWith('c1', 'newer');
    expect(useChatStore.getState().messages[ns('c1')].map((m) => m.id)).toEqual(['older']);
    expect(useChatStore.getState().chats.find((c) => c.id === ns('c1'))?.lastMessage?.id).toBe(
      'older'
    );
  });

  it('does not queue a message when posting is disabled', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1', canSend: false });
    await connect(session);
    await expect(
      useChatStore.getState().sendMessage(ns('c1'), { kind: 'text', text: 'hi' })
    ).rejects.toThrow('cannot send');
    expect(session.sent).toHaveLength(0);
  });

  it('does not post in a channel unless the protocol says you may', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'news', kind: 'channel' });
    session.seedChat({ id: 'own', kind: 'channel', canSend: true });
    await connect(session);
    await expect(
      useChatStore.getState().sendMessage(ns('news'), { kind: 'text', text: 'hi' })
    ).rejects.toThrow('cannot send');
    await useChatStore.getState().sendMessage(ns('own'), { kind: 'text', text: 'hi' });
    expect(session.sent).toHaveLength(1);
  });

  it('sends a still sticker as a photo where the network has no stickers', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);
    const sticker = {
      kind: 'sticker',
      uri: 'https://example.org/wave.webp',
      mimeType: 'image/webp',
      width: 512,
      height: 512,
      emoji: '👋',
    } as const;

    await useChatStore.getState().sendMessage(ns('c1'), sticker);
    expect(session.sent[0].content).toEqual({
      kind: 'image',
      uri: 'https://example.org/wave.webp',
      mimeType: 'image/webp',
      width: 512,
      height: 512,
    });

    await expect(
      useChatStore
        .getState()
        .sendMessage(ns('c1'), { ...sticker, mimeType: 'application/x-tgsticker' })
    ).rejects.toThrow('still pictures');

    Object.assign(session, { sendsStickers: true });
    await useChatStore.getState().sendMessage(ns('c1'), sticker);
    expect(session.sent[1].content).toEqual(sticker);
  });

  it('shows the message optimistically, then marks it sent', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);
    await useChatStore.getState().loadMessages(ns('c1'));

    await useChatStore.getState().sendMessage(ns('c1'), { kind: 'text', text: 'hi' });

    const messages = useChatStore.getState().messages[ns('c1')];
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ fromMe: true, status: 'sent' });
    expect(session.sent).toEqual([{ chatId: 'c1', content: { kind: 'text', text: 'hi' } }]);
  });

  /**
   * A failed send is reported on the message, not thrown. Throwing would put
   * an error banner over the composer as well as the red mark on the bubble,
   * and leave the text in the input, so the obvious next move is to press
   * send again and end up with the same message in the thread twice.
   */
  it('marks a failed send rather than throwing', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);
    await useChatStore.getState().loadMessages(ns('c1'));

    jest.spyOn(session, 'send').mockRejectedValueOnce(new Error('rejected'));

    await expect(
      useChatStore.getState().sendMessage(ns('c1'), { kind: 'text', text: 'nope' })
    ).resolves.toMatchObject({ sent: false, error: new Error('rejected') });

    // The bubble stays, flagged: losing the user's text would be worse.
    const messages = useChatStore.getState().messages[ns('c1')];
    expect(messages).toHaveLength(1);
    expect(messages[0].status).toBe('failed');
  });

  it('sends a failed message again, in place', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);
    await useChatStore.getState().loadMessages(ns('c1'));

    jest.spyOn(session, 'send').mockRejectedValueOnce(new Error('rejected'));
    await useChatStore.getState().sendMessage(ns('c1'), { kind: 'text', text: 'nope' });

    const failed = useChatStore.getState().messages[ns('c1')][0];
    expect(failed.status).toBe('failed');

    await useChatStore.getState().retryMessage(ns('c1'), failed.id);

    const after = useChatStore.getState().messages[ns('c1')];
    // Same message, same place in the thread: a retry is this message getting
    // through, not a new one at the bottom.
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(failed.id);
    expect(after[0].status).toBe('sent');
    expect(session.sent).toEqual([{ chatId: 'c1', content: { kind: 'text', text: 'nope' } }]);
  });

  it('leaves a delivered message alone when asked to retry it', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);
    await useChatStore.getState().loadMessages(ns('c1'));
    await useChatStore.getState().sendMessage(ns('c1'), { kind: 'text', text: 'hi' });

    const delivered = useChatStore.getState().messages[ns('c1')][0];
    await useChatStore.getState().retryMessage(ns('c1'), delivered.id);

    // One send, not two. Re-sending something already delivered would put it
    // in the other person's thread twice.
    expect(session.sent).toHaveLength(1);
  });

  it('reconciles one echoed send without removing another concurrent send', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);
    await useChatStore.getState().loadMessages(ns('c1'));

    const finishes: (() => void)[] = [];
    jest
      .spyOn(session, 'send')
      .mockImplementation(
        () => new Promise<string>((resolve) => finishes.push(() => resolve('sent')))
      );
    const first = useChatStore.getState().sendMessage(ns('c1'), { kind: 'text', text: 'first' });
    const second = useChatStore.getState().sendMessage(ns('c1'), { kind: 'text', text: 'second' });

    session.deliver('c1', {
      id: 'echo-first',
      senderId: session.self.participantId,
      fromMe: true,
      content: { kind: 'text', text: 'first' },
    });

    const afterEcho = useChatStore.getState().messages[ns('c1')];
    expect(afterEcho).toHaveLength(2);
    expect(afterEcho.find((message) => message.id.startsWith('pending:'))?.content).toEqual({
      kind: 'text',
      text: 'second',
    });
    expect(afterEcho.find((message) => message.id === 'echo-first')?.content).toEqual({
      kind: 'text',
      text: 'first',
    });
    finishes.forEach((finish) => finish());
    await Promise.all([first, second]);
  });

  it.each(['before', 'after'])(
    'reconciles a media send whose echo carries its own file, echoed %s the send resolves',
    async (when) => {
      const session = new InMemoryChatSession();
      session.seedChat({ id: 'c1' });
      await connect(session);
      await useChatStore.getState().loadMessages(ns('c1'));
      const echo = () =>
        session.deliver('c1', {
          id: 'echo-img',
          senderId: session.self.participantId,
          fromMe: true,
          content: { kind: 'image', uri: 'file:///protocol/copy.jpg' },
        });
      jest.spyOn(session, 'send').mockImplementation(async () => {
        if (when === 'before') echo();
        return 'echo-img';
      });

      await useChatStore
        .getState()
        .sendMessage(ns('c1'), { kind: 'image', uri: 'https://example.com/picked.jpg' });
      if (when === 'after') echo();

      expect(useChatStore.getState().messages[ns('c1')].map((m) => m.id)).toEqual(['echo-img']);
    }
  );

  it('reconciles a media echo by what survives the trip when the send returns no real id', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    Object.assign(session, { sendsStickers: true });
    await connect(session);
    await useChatStore.getState().loadMessages(ns('c1'));
    jest.spyOn(session, 'send').mockResolvedValue('local:1');
    const sticker = { mimeType: 'image/webp', width: 512, height: 512, size: 20_000 };

    await useChatStore.getState().sendMessage(ns('c1'), {
      kind: 'sticker',
      uri: 'https://example.com/stickers/wow.webp',
      emoji: '😮',
      ...sticker,
    });
    session.deliver('c1', {
      id: '$echo',
      senderId: session.self.participantId,
      fromMe: true,
      content: { kind: 'sticker', uri: 'file:///matrix/media/copy.webp', ...sticker },
    });

    expect(useChatStore.getState().messages[ns('c1')].map((m) => m.id)).toEqual(['$echo']);
  });

  it('sends into a thread and reconciles the echo there', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);
    await useChatStore.getState().loadMessages(ns('c1'));
    const send = jest.spyOn(session, 'send').mockReturnValue(new Promise(() => {}));

    void useChatStore
      .getState()
      .sendMessage(ns('c1'), { kind: 'text', text: 'in thread' }, undefined, 'root');
    expect(send).toHaveBeenCalledWith('c1', { kind: 'text', text: 'in thread' }, undefined, 'root');
    session.deliver('c1', {
      id: 'echo',
      senderId: session.self.participantId,
      fromMe: true,
      content: { kind: 'text', text: 'in thread' },
      threadRoot: 'root',
    });

    expect(useChatStore.getState().messages[ns('c1')].map((m) => m.id)).toEqual(['echo']);
  });

  it('reconciles only one pending row when concurrent sends have identical content', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);
    await useChatStore.getState().loadMessages(ns('c1'));
    jest.spyOn(session, 'send').mockReturnValue(new Promise(() => {}));

    void useChatStore.getState().sendMessage(ns('c1'), { kind: 'text', text: 'same' });
    void useChatStore.getState().sendMessage(ns('c1'), { kind: 'text', text: 'same' });
    session.deliver('c1', {
      id: 'one-echo',
      senderId: session.self.participantId,
      fromMe: true,
      content: { kind: 'text', text: 'same' },
    });

    const messages = useChatStore.getState().messages[ns('c1')];
    expect(messages.filter((message) => message.id.startsWith('pending:'))).toHaveLength(1);
    expect(messages).toHaveLength(2);
  });
});

describe('receiving', () => {
  it('ingests a streamed message and updates the chat preview', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);
    await useChatStore.getState().loadMessages(ns('c1'));

    session.deliver('c1', { content: { kind: 'text', text: 'incoming' } });

    const state = useChatStore.getState();
    expect(state.messages[ns('c1')].at(-1)?.content).toEqual({ kind: 'text', text: 'incoming' });
    expect(state.chats.find((c) => c.id === ns('c1'))?.lastMessage?.content).toEqual({
      kind: 'text',
      text: 'incoming',
    });
  });

  it('does not materialise history for a chat the user never opened', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);

    session.deliver('c1');

    // Preview updates; the transcript stays unloaded until it is opened.
    expect(useChatStore.getState().messages[ns('c1')]).toBeUndefined();
    expect(useChatStore.getState().chats.find((c) => c.id === ns('c1'))?.lastMessage).toBeDefined();
  });

  it('adds a chat announced mid-session', async () => {
    const session = new InMemoryChatSession();
    await connect(session);

    session.announce({
      id: 'c2',
      kind: 'dm',
      title: 'Bob',
      memberIds: [],
      createdAt: 5_000,
      consent: 'request',
    });
    await flushWrites();

    expect(useChatStore.getState().chats.map((c) => c.id)).toContain(ns('c2'));
  });

  it('takes a burst of announced chats in one update', async () => {
    const session = new InMemoryChatSession();
    await connect(session);
    const listener = jest.fn();
    const unsubscribe = useChatStore.subscribe(listener);

    for (const id of ['c2', 'c3', 'c4']) {
      session.announce({
        id,
        kind: 'dm',
        title: id,
        memberIds: [],
        createdAt: 5_000,
        consent: 'request',
      });
    }
    await flushWrites();
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().chats.map((c) => c.id)).toEqual(
      expect.arrayContaining([ns('c2'), ns('c3'), ns('c4')])
    );
  });

  it('changes nothing when a protocol announces a chat exactly as it was', async () => {
    const session = new InMemoryChatSession();
    const chat = session.seedChat({ id: 'c1' });
    session.seedChat({ id: 'c2', createdAt: 2_000 });
    await connect(session);
    const before = useChatStore.getState().chats;
    const listener = jest.fn();
    const unsubscribe = useChatStore.subscribe(listener);

    session.announce({ ...chat });
    await flushWrites();
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
    expect(useChatStore.getState().chats).toBe(before);
  });

  it('updates a chat in place when only its presence changes', async () => {
    const session = new InMemoryChatSession();
    const chat = session.seedChat({ id: 'c1' });
    session.seedChat({ id: 'c2', createdAt: 2_000 });
    await connect(session);
    const before = useChatStore.getState().chats;

    session.announce({ ...chat, online: true });
    await flushWrites();

    const after = useChatStore.getState().chats;
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id));
    expect(after.find((c) => c.id === ns('c1'))?.online).toBe(true);
    expect(after.find((c) => c.id === ns('c2'))).toBe(before.find((c) => c.id === ns('c2')));
  });

  it('orders chats by most recent activity', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'old', createdAt: 1_000 });
    session.seedChat({ id: 'new', createdAt: 2_000 });
    await connect(session);

    session.deliver('old', { sentAt: 9_000 });

    expect(useChatStore.getState().chats.find((c) => c.protocol !== 'local')?.id).toBe(ns('old'));
  });
});

describe('opening a chat', () => {
  function seedLong(session: InMemoryChatSession, count: number) {
    session.seedChat({ id: 'long' });
    for (let index = 1; index <= count; index++) {
      session.deliver('long', {
        id: `m${String(index).padStart(3, '0')}`,
        sentAt: index,
        content: { kind: 'text', text: String(index) },
      });
    }
  }

  it('shows the newest page before the rest of the window arrives', async () => {
    const session = new InMemoryChatSession();
    seedLong(session, 120);
    await connect(session);
    const shown: [number, boolean][] = [];
    const unsubscribe = useChatStore.subscribe((state) => {
      const loaded = state.messages[ns('long')];
      if (loaded && shown.at(-1)?.[0] !== loaded.length)
        shown.push([loaded.length, state.messageHistory[ns('long')].loading]);
    });

    await useChatStore.getState().loadMessages(ns('long'));
    unsubscribe();

    expect(shown).toEqual([
      [50, true],
      [120, false],
    ]);
    expect(useChatStore.getState().messageHistory[ns('long')].hasOlder).toBe(false);
  });

  it('loads the whole window again after its protocol reconnects', async () => {
    const session = new InMemoryChatSession();
    seedLong(session, 120);
    await connect(session);
    await useChatStore.getState().loadMessages(ns('long'));

    await accountRuntime.updateProtocolConfig('test-account', 'xmtp', {});
    await accountRuntime['transition'];
    expect(useChatStore.getState().messageHistory[ns('long')]).toBeUndefined();
    await useChatStore.getState().loadMessages(ns('long'));

    expect(useChatStore.getState().messages[ns('long')]).toHaveLength(120);
    expect(useChatStore.getState().messageHistory[ns('long')].hasOlder).toBe(false);
  });

  it('waits for its protocol before recording that a chat was opened', async () => {
    projectTestAccount('offline-open');
    await useChatStore.getState().loadMessages(ns('somewhere'));
    expect(useChatStore.getState().messageHistory[ns('somewhere')]).toBeUndefined();
  });

  it('pages the protocol from its own oldest message, not a private note older than it', async () => {
    const session = new InMemoryChatSession();
    seedLong(session, 49);
    await connect(session);
    await useChatStore.getState().accountStorage!.messages.insertMessage({
      id: 'note',
      chatId: ns('long'),
      senderId: 'me',
      sentAt: 0,
      content: { kind: 'text', text: 'to self' },
      fromMe: true,
      status: 'sent',
      privateToMe: true,
    });
    const getMessages = jest.spyOn(session, 'getMessages');

    await useChatStore.getState().loadMessages(ns('long'));

    expect(getMessages).toHaveBeenCalledTimes(2);
    expect(getMessages.mock.calls[1][1]?.before).toMatchObject({ id: 'm001' });
  });

  it('opening it again refreshes the newest page and keeps what did not change', async () => {
    const session = new InMemoryChatSession();
    seedLong(session, 120);
    await connect(session);
    await useChatStore.getState().loadMessages(ns('long'));
    const before = useChatStore.getState().messages[ns('long')];
    const getMessages = jest.spyOn(session, 'getMessages');

    await useChatStore.getState().loadMessages(ns('long'));

    const after = useChatStore.getState().messages[ns('long')];
    expect(getMessages).toHaveBeenCalledTimes(1);
    expect(getMessages.mock.calls[0][1]).toMatchObject({ limit: 50 });
    expect(after).toHaveLength(120);
    expect(after.every((message, index) => message === before[index])).toBe(true);
  });
});

describe('stored history pagination', () => {
  it('loads messages older than the initial hydration window', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'long' });
    for (let index = 1; index <= 600; index++) {
      session.deliver('long', {
        id: `m${String(index).padStart(3, '0')}`,
        sentAt: index,
        content: { kind: 'text', text: String(index) },
      });
    }
    await connect(session);

    await useChatStore.getState().loadMessages(ns('long'));
    expect(useChatStore.getState().messages[ns('long')]).toHaveLength(500);
    expect(useChatStore.getState().messageHistory[ns('long')].hasOlder).toBe(true);

    await useChatStore.getState().loadOlderMessages(ns('long'));
    expect(useChatStore.getState().messages[ns('long')]).toHaveLength(600);
    expect(useChatStore.getState().messages[ns('long')][0].id).toBe('m001');
  });

  it('pages local chat history from the account store', async () => {
    const store = new InMemoryMessageStore();
    projectTestAccount('test-account', store);
    for (let index = 1; index <= 600; index++) {
      await store.insertMessage({
        id: `local-${String(index).padStart(3, '0')}`,
        chatId: STATIM_LOCAL_ID,
        senderId: 'me',
        sentAt: index,
        content: { kind: 'text', text: String(index) },
        fromMe: true,
        status: 'sent',
      });
    }

    await useChatStore.getState().loadMessages(STATIM_LOCAL_ID);
    expect(useChatStore.getState().messages[STATIM_LOCAL_ID]).toHaveLength(500);
    await useChatStore.getState().loadOlderMessages(STATIM_LOCAL_ID);
    expect(useChatStore.getState().messages[STATIM_LOCAL_ID]).toHaveLength(600);
    expect(useChatStore.getState().messages[STATIM_LOCAL_ID][0].id).toBe('local-001');
  });

  it('folds a newer reaction when its target arrives from an older page', async () => {
    const store = new InMemoryMessageStore();
    projectTestAccount('test-account', store);
    for (let index = 1; index <= 500; index++) {
      await store.insertMessage({
        id: `m${String(index).padStart(3, '0')}`,
        chatId: STATIM_LOCAL_ID,
        senderId: 'me',
        sentAt: index,
        content: { kind: 'text', text: String(index) },
        fromMe: true,
        status: 'sent',
      });
    }
    await store.insertMessage({
      id: 'reaction-newer',
      chatId: STATIM_LOCAL_ID,
      senderId: 'me',
      sentAt: 501,
      content: { kind: 'reaction', targetId: 'm001', emoji: '👍', action: 'added' },
      fromMe: true,
      status: 'sent',
    });

    await useChatStore.getState().loadMessages(STATIM_LOCAL_ID);
    expect(
      useChatStore.getState().messages[STATIM_LOCAL_ID].some((entry) => entry.id === 'm001')
    ).toBe(false);
    await useChatStore.getState().loadOlderMessages(STATIM_LOCAL_ID);

    expect(
      useChatStore.getState().messages[STATIM_LOCAL_ID].find((entry) => entry.id === 'm001')
        ?.reactions
    ).toEqual({ '👍': ['me'] });
  });
});

describe('account-bound async projections', () => {
  it('does not project a deferred chat refresh after an account switch', async () => {
    const old = new InMemoryChatSession();
    const deferred = defer<Awaited<ReturnType<InMemoryChatSession['listChats']>>>();
    jest.spyOn(old, 'listChats').mockReturnValue(deferred.promise);
    projectTestAccount('old');
    useChatStore.setState({ sessions: { xmtp: old } });

    const refreshing = useChatStore.getState().refreshChats();
    projectTestAccount('new');
    useChatStore.setState({ chats: [testChat({ id: 'xmtp-new-chat' })] });
    deferred.resolve([protocolChat('old-chat')]);
    await refreshing;

    expect(useChatStore.getState().chats.map((entry) => entry.id)).toEqual(['xmtp-new-chat']);
  });

  it.each(['startDm', 'startGroup'] as const)(
    'does not project deferred %s after an account switch',
    async (operation) => {
      const old = new InMemoryChatSession();
      const deferred = defer<Awaited<ReturnType<InMemoryChatSession['createDm']>>>();
      if (operation === 'startDm') jest.spyOn(old, 'createDm').mockReturnValue(deferred.promise);
      else jest.spyOn(old, 'createGroup').mockReturnValue(deferred.promise);
      projectTestAccount('old');
      useChatStore.setState({ sessions: { xmtp: old } });

      const starting =
        operation === 'startDm'
          ? useChatStore.getState().startDm('xmtp', 'carol')
          : useChatStore.getState().startGroup('xmtp', ['carol'], 'Old');
      projectTestAccount('new');
      useChatStore.setState({ chats: [testChat({ id: 'xmtp-new-chat' })] });
      deferred.resolve(protocolChat('native-old'));
      await starting;

      expect(useChatStore.getState().chats.map((entry) => entry.id)).toEqual(['xmtp-new-chat']);
    }
  );

  it.each(['addMembers', 'removeMembers', 'renameGroup', 'leaveGroup'] as const)(
    'does not project deferred %s completion after an account switch',
    async (operation) => {
      const old = new InMemoryChatSession();
      old.seedChat({ id: 'group', kind: 'group', memberIds: ['me', 'carol'] });
      const deferred = defer<void>();
      jest.spyOn(old, operation).mockReturnValue(deferred.promise);
      projectTestAccount('old');
      useChatStore.setState({
        sessions: { xmtp: old },
        chats: [testChat({ id: ns('group') })],
      });

      const state = useChatStore.getState();
      const mutating =
        operation === 'addMembers'
          ? state.addMembers(ns('group'), ['other'])
          : operation === 'removeMembers'
            ? state.removeMembers(ns('group'), ['carol'])
            : operation === 'renameGroup'
              ? state.renameGroup(ns('group'), 'Renamed')
              : state.leaveGroup(ns('group'));
      projectTestAccount('new');
      useChatStore.setState({ chats: [testChat({ id: 'xmtp-new-chat' })] });
      deferred.resolve();
      await mutating;

      expect(useChatStore.getState().chats.map((entry) => entry.id)).toEqual(['xmtp-new-chat']);
    }
  );
});

describe('local persistence failures', () => {
  it.each(['message', 'private message', 'reaction'] as const)(
    'does not show a %s as sent',
    async (kind) => {
      class FailingStore extends InMemoryMessageStore {
        override async insertMessage(): Promise<boolean> {
          throw new Error('disk full');
        }
      }
      projectTestAccount('test-account', new FailingStore());
      const target = {
        id: 'target',
        chatId: STATIM_LOCAL_ID,
        senderId: 'me',
        sentAt: 1,
        content: { kind: 'text' as const, text: 'target' },
        fromMe: true,
        status: 'sent' as const,
      };
      useChatStore.setState({
        chats: [testChat({ id: STATIM_LOCAL_ID })],
        messages: { [STATIM_LOCAL_ID]: [target] },
        rawMessages: { [STATIM_LOCAL_ID]: [target] },
      });

      const action =
        kind === 'message'
          ? useChatStore
              .getState()
              .postLocalMessage(STATIM_LOCAL_ID, { kind: 'text', text: 'new' }, 'me')
          : kind === 'private message'
            ? useChatStore
                .getState()
                .postPrivateMessage(STATIM_LOCAL_ID, { kind: 'text', text: 'private' })
            : useChatStore.getState().react(STATIM_LOCAL_ID, 'target', '👍');
      await expect(action).rejects.toThrow('disk full');

      expect(useChatStore.getState().messages[STATIM_LOCAL_ID]).toEqual([target]);
    }
  );
});

describe('private command output', () => {
  it('restores local-only output beside protocol history', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    const store = new InMemoryMessageStore();
    projectTestAccount('test-account', store);
    await connect(session);
    await useChatStore.getState().loadMessages(ns('c1'));
    await useChatStore.getState().postPrivateMessage(ns('c1'), {
      kind: 'text',
      text: 'only on this device',
    });

    useChatStore.setState({ messages: {} });
    await useChatStore.getState().loadMessages(ns('c1'));

    expect(useChatStore.getState().messages[ns('c1')]).toEqual([
      expect.objectContaining({
        privateToMe: true,
        content: { kind: 'text', text: 'only on this device' },
      }),
    ]);
  });
});

describe('typing', () => {
  it('tells the protocol only when typing indicators are switched on', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    const setTyping = jest.fn(async () => {});
    Object.assign(session, { setTyping });
    await connect(session);

    await useChatStore.getState().setTyping(ns('c1'), true);
    expect(setTyping).not.toHaveBeenCalled();

    useAppearanceStore.setState({ typingIndicators: true });
    await useChatStore.getState().setTyping(ns('c1'), true);
    expect(setTyping).toHaveBeenCalledWith('c1', true);
    useAppearanceStore.setState({ typingIndicators: false });
  });
});

describe('drafts', () => {
  it('shows a draft the protocol keeps for the chat', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);
    useChatStore.getState().ingestChat({
      ...useChatStore.getState().chats.find((c) => c.id === ns('c1'))!,
      draft: 'from another device',
    });
    expect(useChatStore.getState().drafts[draftKey(ns('c1'))]).toBe('from another device');
  });
});

describe('marking unread', () => {
  it('marks the chat on the protocol, and clears it there once read', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1', markedUnread: true });
    const setMarkedUnread = jest.fn(async () => {});
    Object.assign(session, { setMarkedUnread });
    await connect(session);

    await useChatStore.getState().markUnread(ns('c1'));
    expect(setMarkedUnread).toHaveBeenLastCalledWith('c1', true);

    await useChatStore.getState().markRead(ns('c1'));
    expect(setMarkedUnread).toHaveBeenLastCalledWith('c1', false);
  });

  it('follows a mark made or cleared on another device', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);
    const chat = () => useChatStore.getState().chats.find((c) => c.id === ns('c1'))!;
    const readAt = () => useChatStore.getState().readAt[ns('c1')];

    useChatStore.getState().ingestChat({ ...chat(), markedUnread: true });
    expect(readAt()).toBe(MARKED_UNREAD);
    useChatStore.getState().ingestChat({ ...chat(), markedUnread: false });
    expect(readAt()).toBeGreaterThan(0);
  });
});

describe('blocking', () => {
  const blockedIn = () => useChatStore.getState().chats.find((c) => c.id === ns('ex'))?.blocked;

  it('blocks and unblocks the other participant of a DM through the protocol', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'ex', title: 'Ex' });
    await connect(session);

    await useChatStore.getState().setBlocked(ns('ex'), true);
    expect(blockedIn()).toBe(true);
    expect((await session.listChats()).find((c) => c.id === 'ex')?.blocked).toBe(true);
    await expect(
      useChatStore.getState().sendMessage(ns('ex'), { kind: 'text', text: 'hi' })
    ).rejects.toThrow('You blocked this person.');

    await useChatStore.getState().setBlocked(ns('ex'), false);
    expect(blockedIn()).toBe(false);
  });

  it('blocks no one in a group', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'g', title: 'Group', kind: 'group' });
    await connect(session);

    await expect(useChatStore.getState().setBlocked(ns('g'), true)).rejects.toThrow(
      'Only a DM can be blocked'
    );
  });

  it('unblocks again when the protocol refuses', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'ex', title: 'Ex' });
    await connect(session);
    session.setBlocked = async () => {
      throw new Error('offline');
    };

    await expect(useChatStore.getState().setBlocked(ns('ex'), true)).rejects.toThrow('offline');
    expect(blockedIn()).toBe(false);
  });
});

describe('disconnecting', () => {
  it('clears protocol state', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'c1' });
    await connect(session);

    await disconnectFake();

    expect(session.disconnected).toBe(true);
    expect(useChatStore.getState().status).toBe('idle');
    expect(useChatStore.getState().chats.filter((c) => c.protocol !== 'local')).toHaveLength(0);
  });
});

describe('consent', () => {
  /** A stranger's chat: present, but not yet replied to. */
  const withRequest = async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'spam', title: 'Stranger', consent: 'request' });
    await connect(session);
    return session;
  };

  it('accepts a request', async () => {
    const session = await withRequest();

    await useChatStore.getState().setConsent(ns('spam'), 'accepted');

    expect(useChatStore.getState().chats.find((c) => c.id === ns('spam'))?.consent).toBe(
      'accepted'
    );
    expect((await session.listChats()).find((c) => c.id === 'spam')?.consent).toBe('accepted');
  });

  it('refusing tells the transport, so the decision outlives this device', async () => {
    const session = await withRequest();

    await useChatStore.getState().setConsent(ns('spam'), 'declined');

    // The point of routing this through the session rather than a local flag:
    // a reinstall, and this account's other phone, both have to see it.
    expect((await session.listChats()).find((c) => c.id === 'spam')?.consent).toBe('declined');
  });

  it('puts the chat back when the protocol refuses', async () => {
    const session = await withRequest();
    session.setConsent = async () => {
      throw new Error('offline');
    };

    await expect(useChatStore.getState().setConsent(ns('spam'), 'declined')).rejects.toThrow(
      'offline'
    );

    // The update is optimistic, so a failure has to undo it; otherwise the row
    // stays gone and the stranger silently reappears on the next sync.
    expect(useChatStore.getState().chats.find((c) => c.id === ns('spam'))?.consent).toBe('request');
  });

  it('undoes only its own change when the protocol refuses', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'spam', title: 'Stranger', consent: 'request' });
    session.seedChat({ id: 'other', title: 'Known', consent: 'accepted' });
    await connect(session);
    const call = defer<void>();
    session.setConsent = () => call.promise.then(() => Promise.reject(new Error('offline')));

    const declining = useChatStore.getState().setConsent(ns('spam'), 'declined');
    const other = useChatStore.getState().chats.find((c) => c.id === ns('other'))!;
    useChatStore.getState().ingestChat({ ...other, title: 'Renamed' });
    useChatStore.getState().ingestMessage({
      id: 'late',
      chatId: ns('spam'),
      senderId: 'stranger',
      sentAt: Date.now(),
      content: { kind: 'text', text: 'still there?' },
      fromMe: false,
      status: 'sent',
    });
    call.resolve();
    await expect(declining).rejects.toThrow('offline');

    const chats = useChatStore.getState().chats;
    const spam = chats.find((c) => c.id === ns('spam'));
    expect(spam?.consent).toBe('request');
    expect(spam?.lastMessage?.id).toBe('late');
    expect(chats.find((c) => c.id === ns('other'))?.title).toBe('Renamed');
  });

  it('declines only a request', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'known', title: 'Known', consent: 'accepted' });
    await connect(session);
    const setConsent = jest.spyOn(session, 'setConsent');

    await expect(useChatStore.getState().setConsent(ns('known'), 'declined')).rejects.toThrow(
      'Only a request can be declined.'
    );

    expect(setConsent).not.toHaveBeenCalled();
    expect(useChatStore.getState().chats.find((c) => c.id === ns('known'))?.consent).toBe(
      'accepted'
    );
  });

  it('rejects rather than throws when the protocol lacks the capability', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'team', title: 'Team', kind: 'group', consent: 'accepted' });
    await connect(session);
    (session as { getGroupInfo?: unknown }).getGroupInfo = undefined;

    const info = useChatStore.getState().getGroupInfo(ns('team'));

    await expect(info).rejects.toThrow();
  });

  it('says so when the protocol has no notion of consent', async () => {
    const session = await withRequest();
    // Nostr has no roster and no stranger, so it omits the method
    // rather than pretending to honour it. Assigned rather than deleted: it
    // lives on the prototype, which `delete` on the instance does not touch.
    (session as { setConsent?: unknown }).setConsent = undefined;

    await expect(useChatStore.getState().setConsent(ns('spam'), 'declined')).rejects.toThrow(
      /no way to decline/
    );
  });
});

it('starts every account from empty lists no one can change in place', () => {
  const { chats, messages } = useChatStore.getState();
  // @ts-expect-error
  expect(() => chats.push(chats[0])).toThrow(TypeError);
  expect(Object.isFrozen(messages)).toBe(true);
});

describe('mergeChats', () => {
  const chat = (id: string, over: Partial<Chat> = {}) =>
    testChat({ createdAt: 1_000, ...over, id: `xmtp-${id}` });
  const noDraft = () => undefined;

  it('hands back the same slices when an update changes nothing', () => {
    const list = { chats: [chat('a')], drafts: {}, readAt: {} };
    const next = mergeChats(list, [chat('a')], noDraft, 0);
    expect(next.chats).toBe(list.chats);
    expect(next.drafts).toBe(list.drafts);
    expect(next.readAt).toBe(list.readAt);
  });

  it('adopts a protocol draft, follows a mark cleared elsewhere and sorts a new chat in', () => {
    const list = {
      chats: [chat('a', { markedUnread: true })],
      drafts: {},
      readAt: { 'xmtp-a': MARKED_UNREAD },
    };
    const next = mergeChats(
      list,
      [chat('a', { draft: 'later' }), chat('b', { createdAt: 2_000 })],
      (_id, text) => text,
      7_000
    );
    expect(next.chats.map((c) => c.id)).toEqual(['xmtp-b', 'xmtp-a']);
    expect(next.drafts).toEqual({ 'xmtp-a': 'later' });
    expect(next.readAt).toEqual({ 'xmtp-a': 7_000 });
  });

  it('reads a chat up to your own newest message, unless you marked it unread', () => {
    const last = (id: string, sentAt: number, fromMe: boolean) =>
      chat(id, {
        lastMessage: {
          id: `${id}-${sentAt}`,
          chatId: asChatId(`xmtp-${id}`),
          senderId: fromMe ? 'me' : 'them',
          sentAt,
          content: { kind: 'text', text: 'hi' },
          fromMe,
          status: 'sent',
        },
      });
    const list = {
      chats: [last('synced', 3_000, true), chat('sent'), chat('marked'), chat('theirs')],
      drafts: {},
      readAt: { 'xmtp-synced': 1_000, 'xmtp-marked': MARKED_UNREAD, 'xmtp-theirs': 1_000 },
    };
    const next = mergeChats(
      list,
      [
        last('synced', 3_000, true),
        last('sent', 2_000, true),
        last('marked', 4_000, true),
        last('theirs', 5_000, false),
      ],
      noDraft,
      9_000
    );
    expect(next.readAt).toEqual({
      'xmtp-synced': 3_000,
      'xmtp-sent': 2_000,
      'xmtp-marked': MARKED_UNREAD,
      'xmtp-theirs': 1_000,
    });
  });
});

describe('removing messages', () => {
  it('keeps the preview when an older message goes, and drops it for a chat never opened', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'open' });
    session.seedChat({ id: 'closed' });
    session.deliver('open', { id: 'first', sentAt: 1_000 });
    session.deliver('open', { id: 'last', sentAt: 2_000 });
    session.deliver('closed', { id: 'only', sentAt: 1_000 });
    await connect(session);
    await useChatStore.getState().loadMessages(ns('open'));
    const chat = (id: string) => useChatStore.getState().chats.find((c) => c.id === id);

    useChatStore.getState().removeMessages(ns('open'), ['first']);
    expect(chat(ns('open'))?.lastMessage?.id).toBe('last');

    useChatStore.getState().removeMessages(ns('closed'), ['only']);
    expect(chat(ns('closed'))?.lastMessage).toBeUndefined();
  });
});

describe('local messages', () => {
  it('keep the order they were posted in when the clock stands still or goes back', async () => {
    projectTestAccount('test-account', new InMemoryMessageStore());
    const clock = jest.spyOn(Date, 'now').mockReturnValue(5_000);
    const notes = asChatId('xmtp-local:notes');
    const post = (text: string) =>
      useChatStore.getState().postLocalMessage(notes, { kind: 'text', text }, 'me');

    await post('one');
    await post('two');
    clock.mockReturnValue(4_000);
    await post('three');
    clock.mockRestore();

    expect(useChatStore.getState().messages[notes].map((m) => m.sentAt)).toEqual([
      5_000, 5_001, 5_002,
    ]);
  });

  it('keep the message a reply answers', async () => {
    projectTestAccount('test-account', new InMemoryMessageStore());
    const store = useChatStore.getState();
    await store.postLocalMessage(SAVED_LOCAL_ID, { kind: 'text', text: 'question' }, 'me');
    const [question] = useChatStore.getState().messages[SAVED_LOCAL_ID];

    await store.sendMessage(SAVED_LOCAL_ID, { kind: 'text', text: 'answer' }, question.id);

    const answer = useChatStore.getState().messages[SAVED_LOCAL_ID].at(-1);
    expect(answer?.replyTo).toBe(question.id);
  });
});

describe('switching accounts', () => {
  it('forgets which pending send an echo belongs to', () => {
    const chat = asChatId('xmtp-chat');
    const pending = (id: string): ChatMessage => ({
      id,
      chatId: chat,
      senderId: 'me',
      sentAt: 1_000,
      content: { kind: 'text', text: 'hi' },
      fromMe: true,
      status: 'sending',
    });
    projectTestAccount('first');
    useChatStore.setState({ rawMessages: { [chat]: [pending('pending:a')] } });
    useChatStore.getState().replacePending(chat, 'pending:a', 'sent', 'echo');

    projectTestAccount('second');
    useChatStore.setState({ rawMessages: { [chat]: [pending('pending:b')] } });
    useChatStore.getState().ingestMessage({ ...pending('echo'), status: 'sent' });

    expect(useChatStore.getState().rawMessages[chat].map((m) => m.id)).toEqual(['echo']);
  });
});

function defer<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function protocolChat(id: string): ProtocolChat {
  return { ...testChat({ title: id }), id: protocolChatId(id), lastMessage: undefined };
}

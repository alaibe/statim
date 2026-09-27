import AsyncStorage from '@react-native-async-storage/async-storage';

import { botChatId, isLocalChat, type Bot } from './bots';
import { useChatStore } from './chat-store';
import { InMemoryChatSession } from './in-memory-session';
import {
  connectFake,
  disconnectFake,
  ns,
  projectTestAccount,
  resetChatStore,
} from './testing/store';
import { deleteAccountDatabase } from '@/storage/database';
import { asChatId } from './testing/ids';

jest.mock('../account/keyring', () => ({
  ...jest.requireActual('../account/keyring'),
  loadOrCreateDbEncryptionKey: async () => new Uint8Array(32),
}));

const BOT_ID = 'status';
const CHAT = botChatId(BOT_ID);

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: BOT_ID,
    name: 'Status',
    tagline: 'on-device',
    greeting: () => ['Welcome.'],
    async onMessage(text, ctx) {
      await ctx.say(`echo: ${text}`);
    },
    ...overrides,
  };
}

const reset = resetChatStore;

beforeEach(async () => {
  await AsyncStorage.clear();
  await deleteAccountDatabase('bots-test');
  reset();
  projectTestAccount('bots-test');
});

afterEach(async () => {
  await deleteAccountDatabase('bots-test');
});

describe('registering bots', () => {
  it('creates a chat and posts the greeting on first run', async () => {
    await useChatStore.getState().registerBots([makeBot()]);

    const state = useChatStore.getState();
    expect(state.chats.map((c) => c.id)).toEqual([CHAT]);
    expect(state.messages[CHAT].map((m) => m.content)).toEqual([
      { kind: 'text', text: 'Welcome.' },
    ]);
  });

  it('works with no protocol session at all', async () => {
    // The whole reason bots are local: the chat list is never empty while the
    // protocol is still dialling, or offline.
    expect(useChatStore.getState().sessions).toEqual({});
    await useChatStore.getState().registerBots([makeBot()]);
    expect(useChatStore.getState().chats).toHaveLength(1);
  });

  it('restores saved history instead of greeting again', async () => {
    await useChatStore.getState().registerBots([makeBot()]);
    await useChatStore.getState().sendMessage(CHAT, { kind: 'text', text: 'hi' });

    // Simulate a relaunch: same storage, fresh store.
    reset();
    projectTestAccount('bots-test');
    await useChatStore.getState().registerBots([makeBot()]);

    const texts = useChatStore
      .getState()
      .messages[CHAT].map((m) => (m.content.kind === 'text' ? m.content.text : ''));

    expect(texts).toEqual(['Welcome.', 'hi', 'echo: hi']);
    expect(texts.filter((t) => t === 'Welcome.')).toHaveLength(1);
  });

  it('removes the chat when its plugin is disabled', async () => {
    await useChatStore.getState().registerBots([makeBot()]);
    await useChatStore.getState().registerBots([]);

    expect(useChatStore.getState().chats).toHaveLength(0);
  });
});

describe('talking to a bot', () => {
  it('routes locally and never touches the protocol', async () => {
    const session = new InMemoryChatSession();
    await connectFake(session);
    await useChatStore.getState().registerBots([makeBot()]);

    await useChatStore.getState().sendMessage(CHAT, { kind: 'text', text: 'ping' });

    expect(session.sent).toHaveLength(0);
    const messages = useChatStore.getState().messages[CHAT];
    expect(messages.at(-2)).toMatchObject({ fromMe: true });
    expect(messages.at(-1)?.content).toEqual({ kind: 'text', text: 'echo: ping' });
  });

  it('handles a bot that chooses not to reply', async () => {
    await useChatStore.getState().registerBots([makeBot({ onMessage: undefined })]);
    await useChatStore.getState().sendMessage(CHAT, { kind: 'text', text: 'quiet' });

    expect(useChatStore.getState().messages[CHAT]).toHaveLength(2);
  });

  it('persists a widget reply as data, so it survives a relaunch', async () => {
    const bot = makeBot({
      async onMessage(_text, ctx) {
        await ctx.say({
          kind: 'widget',
          fallback: '1.5 ETH',
          widget: { kind: 'stat', value: '1.5 ETH', label: 'Balance' },
        });
      },
    });

    await useChatStore.getState().registerBots([bot]);
    await useChatStore.getState().sendMessage(CHAT, { kind: 'text', text: '/balance' });

    reset();
    projectTestAccount('bots-test');
    await useChatStore.getState().registerBots([bot]);

    expect(useChatStore.getState().messages[CHAT].at(-1)?.content).toEqual({
      kind: 'widget',
      fallback: '1.5 ETH',
      widget: { kind: 'stat', value: '1.5 ETH', label: 'Balance' },
    });
  });
});

describe('bot history and the protocol session', () => {
  it('survives disconnecting from the protocol', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'remote-1' });

    await connectFake(session);
    await useChatStore.getState().registerBots([makeBot()]);

    await disconnectFake();

    const state = useChatStore.getState();
    expect(state.chats.map((c) => c.id)).toEqual([CHAT]);
    expect(state.messages[CHAT]).toHaveLength(1);
  });

  it('keeps bot chats when the protocol list refreshes', async () => {
    const session = new InMemoryChatSession();
    session.seedChat({ id: 'remote-1' });

    await connectFake(session);
    await useChatStore.getState().registerBots([makeBot()]);
    await useChatStore.getState().refreshChats();

    const ids = useChatStore.getState().chats.map((c) => c.id);
    expect(ids).toContain(CHAT);
    expect(ids).toContain(ns('remote-1'));
  });
});

describe('isLocalChat', () => {
  it('is URL-safe, because ids become route segments', () => {
    expect(CHAT).not.toContain(':');
    expect(isLocalChat(CHAT)).toBe(true);
    expect(isLocalChat(asChatId('a'.repeat(64)))).toBe(false);
  });
});

describe('registering several bots', () => {
  /**
   * The chats arrive in one commit. Committed one at a time, the chat list
   * grows a row at a time and re-sorts after each, so nine chats appearing
   * over a second or two shuffle everything below them and a tap during that
   * opens whichever chat slid into the place you aimed at. Counting the
   * commits is the only way to hold that: the resulting list looks identical
   * either way.
   */
  it('adds them in a single commit', async () => {
    const session = new InMemoryChatSession({ participantId: 'a'.repeat(64) });
    await connectFake(session);

    const bots = ['one', 'two', 'three', 'four'].map((id) =>
      makeBot({ id, name: id, greeting: () => [] })
    );

    let commits = 0;
    const unsubscribe = useChatStore.subscribe((state, previous) => {
      if (state.chats !== previous.chats) commits += 1;
    });

    await useChatStore.getState().registerBots(bots);
    unsubscribe();

    expect(useChatStore.getState().chats.filter((c) => isLocalChat(c.id))).toHaveLength(4);
    // One for the batch. The cleanup pass that drops dead chats may add a
    // second; four separate appends is the regression.
    expect(commits).toBeLessThanOrEqual(2);
  });
});

import { createAccountStorage, type AccountStorage } from '@/storage/account';
import { deleteAccountDatabase } from '@/storage/database';
import {
  loadChatPrefs,
  orderChats,
  saveChatPrefs,
  withPref,
  type ChatPrefsMap,
} from './chat-prefs';
import { testChat } from './testing/chats';
import { asChatId } from './testing/ids';
import type { Chat } from './types';

const C1 = asChatId('xmtp-c1');
const C2 = asChatId('xmtp-c2');

function chat(raw: string, sentAt: number): Chat {
  const id = `xmtp-${raw}`;
  return testChat({
    id,
    lastMessage: {
      id: `${raw}-m`,
      chatId: asChatId(id),
      senderId: 'a',
      sentAt,
      content: { kind: 'text', text: 'hi' },
      fromMe: false,
      status: 'sent',
    },
  });
}

beforeEach(async () => {
  for (const id of ['prefs-test', 'acct-a', 'acct-b']) await deleteAccountDatabase(id);
});

describe('withPref', () => {
  it('sets a flag', () => {
    expect(withPref({}, C1, { pinned: true })).toEqual({ [C1]: { pinned: true } });
  });

  it('drops the entry when nothing is left to remember', () => {
    // Otherwise un-pinning leaves `{ pinned: false }` behind forever and the
    // map grows by one entry per chat ever touched.
    const prefs = withPref({}, C1, { pinned: true });
    expect(withPref(prefs, C1, { pinned: false })).toEqual({});
  });

  it('keeps other flags when one is cleared', () => {
    let prefs: ChatPrefsMap = withPref({}, C1, { pinned: true });
    prefs = withPref(prefs, C1, { muted: true });
    prefs = withPref(prefs, C1, { pinned: false });

    expect(prefs).toEqual({ [C1]: { muted: true } });
  });

  it('leaves other chats alone', () => {
    const prefs = withPref({ [C2]: { muted: true } }, C1, { pinned: true });
    expect(prefs[C2]).toEqual({ muted: true });
  });
});

describe('orderChats', () => {
  it('puts pinned chats first', () => {
    const list = [chat('old', 1), chat('new', 9)];
    const out = orderChats(list, { [asChatId('xmtp-old')]: { pinned: true } });

    expect(out.map((c) => c.id)).toEqual(['xmtp-old', 'xmtp-new']);
  });

  it('sorts by recency within each group', () => {
    const list = [chat('a', 1), chat('b', 5), chat('c', 3)];
    expect(orderChats(list, {}).map((c) => c.id)).toEqual(['xmtp-b', 'xmtp-c', 'xmtp-a']);
  });

  it('removes archived chats rather than sinking them', () => {
    const list = [chat('a', 5), chat('b', 1)];
    expect(orderChats(list, { [asChatId('xmtp-a')]: { archived: true } }).map((c) => c.id)).toEqual(
      ['xmtp-b']
    );
  });

  it('can include archived when the archive is being viewed', () => {
    const list = [chat('a', 5), chat('b', 1)];
    const out = orderChats(
      list,
      { [asChatId('xmtp-a')]: { archived: true } },
      { includeArchived: true }
    );
    expect(out).toHaveLength(2);
  });
});

describe('persistence', () => {
  let storage: AccountStorage;
  beforeEach(() => {
    storage = createAccountStorage('prefs-test');
  });

  it('round-trips', async () => {
    await saveChatPrefs(storage, { [C1]: { pinned: true } });
    expect(await loadChatPrefs(storage)).toEqual({ [C1]: { pinned: true } });
  });

  it('returns an empty map when nothing is stored', async () => {
    expect(await loadChatPrefs(storage)).toEqual({});
  });

  it('is scoped per account', async () => {
    const a = createAccountStorage('acct-a');
    const b = createAccountStorage('acct-b');
    await saveChatPrefs(a, { [C1]: { pinned: true } });

    expect(await loadChatPrefs(b)).toEqual({});

    expect(await loadChatPrefs(a)).toEqual({ [C1]: { pinned: true } });
  });
});

import {
  chatListRows,
  inFolder,
  isUnreadHere,
  matchesFilter,
  splitRequests,
  type ChatListRow,
} from './folders';
import { testChat } from './testing/chats';
import { asChatId } from './testing/ids';
import type { Chat } from './types';

function chat(over: Omit<Partial<Chat>, 'id'> & { id: string }): Chat {
  return testChat({
    lastMessage: {
      id: `${over.id}-m`,
      chatId: asChatId(over.id),
      senderId: 'other',
      sentAt: 1_000,
      content: { kind: 'text', text: 'hi' },
      fromMe: false,
      status: 'sent',
    },
    ...over,
  });
}

const empty = { prefs: {}, readAt: {} };
const shape = (rows: ChatListRow[]) =>
  rows.map((r) => (r.kind === 'chat' ? r.chat.id : `${r.folder}[${r.chats.map((c) => c.id)}]`));

describe('splitRequests', () => {
  it('splits your chats from requests and leaves declined chats out of both', () => {
    const split = splitRequests([
      chat({ id: 'accepted' }),
      chat({ id: 'stranger', consent: 'request' }),
      chat({ id: 'declined', consent: 'declined' }),
    ]);
    expect(split.accepted.map((c) => c.id)).toEqual(['accepted']);
    expect(split.requests.map((c) => c.id)).toEqual(['stranger']);
  });
});

describe('matchesFilter', () => {
  it('sorts chats into DMs and Groups, keeping the app’s own bots out of DMs', () => {
    expect(matchesFilter(chat({ id: 'dm' }), 'dms', empty)).toBe(true);
    expect(matchesFilter(chat({ id: 'g', kind: 'group' }), 'groups', empty)).toBe(true);
    expect(matchesFilter(chat({ id: 'c', kind: 'channel' }), 'groups', empty)).toBe(true);
    expect(matchesFilter(chat({ id: 'local-status' }), 'dms', empty)).toBe(false);
  });

  it('counts unread, but not muted or already read', () => {
    const c = chat({ id: 'c1' });
    expect(isUnreadHere(c, empty)).toBe(true);
    expect(isUnreadHere(c, { prefs: { [c.id]: { muted: true } }, readAt: {} })).toBe(false);
    expect(isUnreadHere(c, { prefs: {}, readAt: { [c.id]: 5_000 } })).toBe(false);
  });

  it('shows chats with unread mentions in the Mentions filter', () => {
    expect(
      matchesFilter(chat({ id: 'g', kind: 'group', mentionCount: 2 }), 'mentions', empty)
    ).toBe(true);
    expect(
      matchesFilter(chat({ id: 'h', kind: 'group', mentionCount: 0 }), 'mentions', empty)
    ).toBe(false);
  });

  it('drops a chat from Mentions once it is read here, whatever the protocol still counts', () => {
    const read = { prefs: {}, readAt: { g: 5_000 } };
    expect(matchesFilter(chat({ id: 'g', kind: 'group', mentionCount: 2 }), 'mentions', read)).toBe(
      false
    );
  });
});

describe('inFolder', () => {
  it('holds a network’s chats, bridged or native, and the archive holds only archived ones', () => {
    const slack = chat({ id: 's', protocol: 'matrix', network: 'Slack' });
    expect(inFolder(slack, 'network:Slack', empty)).toBe(true);
    expect(inFolder(slack, 'network:matrix', empty)).toBe(false);

    const archived = { prefs: { s: { archived: true } }, readAt: {} };
    expect(inFolder(slack, 'network:Slack', archived)).toBe(false);
    expect(inFolder(slack, 'archive', archived)).toBe(true);
  });
});

describe('chatListRows', () => {
  const folded = (network: string) => network !== 'nostr';
  const all = () => true;

  it('folds other networks into one row where their latest chat sits', () => {
    const ordered = [
      chat({ id: 's1', protocol: 'matrix', network: 'Slack' }),
      chat({ id: 'n1', protocol: 'nostr' }),
      chat({ id: 't1', protocol: 'telegram' }),
      chat({ id: 's2', protocol: 'matrix', network: 'Slack' }),
      chat({ id: 'bot', protocol: 'local' }),
    ];
    expect(shape(chatListRows(ordered, all, folded, empty))).toEqual([
      'network:Slack[s1,s2]',
      'n1',
      'network:telegram[t1]',
      'bot',
    ]);
  });

  it('puts Archive first and keeps archived chats out of the rest', () => {
    const ordered = [
      chat({ id: 'n1', protocol: 'nostr' }),
      chat({ id: 's1', protocol: 'matrix', network: 'Slack' }),
    ];
    const context = { prefs: { s1: { archived: true } }, readAt: {} };
    expect(shape(chatListRows(ordered, all, folded, context))).toEqual(['archive[s1]', 'n1']);
  });

  it('leaves a pinned chat out of its folder', () => {
    const ordered = [
      chat({ id: 's1', protocol: 'matrix', network: 'Slack' }),
      chat({ id: 's2', protocol: 'matrix', network: 'Slack' }),
    ];
    const context = { prefs: { s1: { pinned: true } }, readAt: {} };
    expect(shape(chatListRows(ordered, all, folded, context))).toEqual(['s1', 'network:Slack[s2]']);
  });

  it('shows a folder only when something in it passes the filter', () => {
    const ordered = [
      chat({ id: 's1', protocol: 'matrix', network: 'Slack', kind: 'group' }),
      chat({ id: 't1', protocol: 'telegram' }),
    ];
    const dms = (c: Chat) => matchesFilter(c, 'dms', empty);
    expect(shape(chatListRows(ordered, dms, folded, empty))).toEqual(['network:telegram[t1]']);
  });
});

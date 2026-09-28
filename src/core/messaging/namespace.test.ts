import { botChatId, isLocalChat, STATIM_LOCAL_ID } from './bots';
import {
  LOCAL_PROTOCOL,
  NATIVE_ID,
  namespaceChat,
  namespacedId,
  namespaceMessage,
  parseChatId,
  parseChatRoute,
  PROTOCOL_IDS,
  protocolChatId,
  protocolOf,
  splitChatId,
} from './namespace';
import { asChatId } from './testing/ids';
import type { ProtocolMessage, ProtocolChat } from './types';

describe('namespacedId', () => {
  it('round-trips through splitChatId', () => {
    const id = namespacedId('nostr', protocolChatId('abc123'));
    expect(id).toBe('nostr-abc123');
    expect(splitChatId(id)).toEqual({ protocol: 'nostr', nativeId: 'abc123' });
  });

  it('splits on the first hyphen, so a native id may contain its own', () => {
    // XMTP ids are hex, but the fake sessions and any future protocol may not
    // be. Getting this wrong routes `xmtp-dm-abc` to a protocol called
    // "xmtp-dm", which does not exist.
    expect(splitChatId(asChatId('xmtp-dm-abc'))).toEqual({
      protocol: 'xmtp',
      nativeId: 'dm-abc',
    });
  });

  it('refuses a native id that would not survive a URL path segment', () => {
    // This is the bug the whole module exists to prevent: a chat id
    // becomes `/chat/<id>`, and a slash or colon silently fails to route.
    expect(() => namespacedId('status', protocolChatId('/waku/2/rs/1/0'))).toThrow(/URL-safe/);
    expect(() => namespacedId('nostr', protocolChatId('a:b'))).toThrow(/URL-safe/);
  });
});

describe('PROTOCOL_IDS', () => {
  it('has no hyphen in any id, since a chat id splits at the first one', () => {
    expect(PROTOCOL_IDS.filter((id) => id.includes('-'))).toEqual([]);
  });
});

describe('parseChatId', () => {
  it('takes an app id as a route, a notification or the CLI hands it over', () => {
    expect(parseChatId('xmtp-abc')).toBe('xmtp-abc');
    expect(parseChatId('xmtp-dm-abc')).toBe('xmtp-dm-abc');
  });

  it('refuses an id whose protocol the app does not speak', () => {
    expect(parseChatId('stub-abc')).toBeNull();
    expect(parseChatId('XMTP-abc')).toBeNull();
  });

  it('refuses a string with no recognisable prefix', () => {
    // An id minted before namespacing existed. Guessing a protocol would send
    // one protocol's message down another's wire.
    expect(parseChatId('a'.repeat(64))).toBeNull();
    expect(parseChatId('XMTP-abc')).toBeNull();
    expect(parseChatId('xmtp-')).toBeNull();
    expect(parseChatId('')).toBeNull();
  });
});

describe('parseChatRoute', () => {
  it('parses an app id and splits it in one step', () => {
    expect(parseChatRoute('xmtp-dm-abc')).toEqual({
      id: 'xmtp-dm-abc',
      protocol: 'xmtp',
      nativeId: 'dm-abc',
    });
    expect(parseChatRoute('XMTP-abc')).toBeNull();
  });
});

describe('local chats', () => {
  it('parse as the reserved "local" protocol without a special case', () => {
    // bots.ts chose `local-` for the same URL-safety reason; this keeps the
    // two consistent rather than making every caller test for both.
    expect(LOCAL_PROTOCOL).toBe('local');
    expect(protocolOf(STATIM_LOCAL_ID)).toBe('local');
    expect(isLocalChat(botChatId('statim'))).toBe(true);
  });

  it('produces bot ids that are themselves valid native ids', () => {
    expect(NATIVE_ID.test('statim')).toBe(true);
  });
});

describe('projection', () => {
  const message: ProtocolMessage = {
    id: 'm1',
    chatId: protocolChatId('c1'),
    senderId: 'p1',
    sentAt: 10,
    content: { kind: 'text', text: 'hi' },
    fromMe: false,
    status: 'sent',
  };

  it('rewrites a message chat id', () => {
    expect(namespaceMessage('nostr', message).chatId).toBe('nostr-c1');
  });

  it('rewrites a chat and its preview, and stamps the protocol', () => {
    const chat: ProtocolChat = {
      id: protocolChatId('c1'),
      kind: 'dm',
      title: 'Alice',
      memberIds: ['p1'],
      createdAt: 1,
      consent: 'accepted',
      lastMessage: message,
    };

    const namespaced = namespaceChat('status', chat);
    expect(namespaced.id).toBe('status-c1');
    expect(namespaced.protocol).toBe('status');
    // The preview has to be rewritten too; the chat list keys rows off it.
    expect(namespaced.lastMessage?.chatId).toBe('status-c1');
  });
});

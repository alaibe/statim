import type { Chat } from '@/core/messaging/types';

import { fromContactKey, contactKey, contactsOf } from './contacts';
import { botChatId } from '@/core/messaging/bots';
import { testChat } from '@/core/messaging/testing/chats';
import { asChatId } from '@/core/messaging/testing/ids';

/**
 * Pinned after React complained: the same contact appeared once per DM held with
 * them, which rendered as two rows with the same name and the same avatar and
 * reported "two children with the same key" in the console.
 */
const dm = (over: Partial<Chat>): Chat =>
  testChat({ protocol: 'nostr', memberIds: ['me', 'them'], title: '', ...over });

const self = () => 'me';

describe('the people behind a list of chats', () => {
  it('shows a person once, however many threads you have with them', () => {
    const contacts = contactsOf(
      [
        dm({ id: asChatId('nostr-newest'), memberIds: ['me', 'them'] }),
        dm({ id: asChatId('nostr-older'), memberIds: ['me', 'them'] }),
      ],
      self
    );

    expect(contacts).toHaveLength(1);
  });

  it('keeps the most recent thread, which is the one tapping opens', () => {
    const contacts = contactsOf(
      [dm({ id: asChatId('nostr-newest') }), dm({ id: asChatId('nostr-older') })],
      self
    );

    expect(contacts[0].chatId).toBe('nostr-newest');
  });

  /**
   * Two protocols is two participants with two different keys. Collapsing them
   * into one row would claim a link the app cannot verify.
   */
  it('keeps the same name on two protocols apart', () => {
    const contacts = contactsOf(
      [
        dm({ id: asChatId('nostr-1'), protocol: 'nostr' }),
        dm({ id: asChatId('xmtp-1'), protocol: 'xmtp' }),
      ],
      self
    );

    expect(contacts.map((p) => p.protocol)).toEqual(['nostr', 'xmtp']);
  });

  it('never lists you', () => {
    expect(contactsOf([dm({ memberIds: ['me'] })], self)).toEqual([]);
  });

  it('leaves out groups, declined threads and local chats', () => {
    const contacts = contactsOf(
      [
        dm({ id: asChatId('group-1'), kind: 'group', memberIds: ['me', 'a'] }),
        dm({ id: asChatId('nostr-declined'), memberIds: ['me', 'b'], consent: 'declined' }),
        dm({ id: botChatId('wallet'), memberIds: ['me', 'wallet'] }),
        dm({ id: asChatId('nostr-real'), memberIds: ['me', 'c'] }),
      ],
      self
    );

    expect(contacts.map((p) => p.id)).toEqual(['c']);
  });

  /** Every row needs a key React can tell apart. That was the reported bug. */
  it('produces one unique key per row', () => {
    const contacts = contactsOf(
      [
        dm({ id: asChatId('nostr-1'), memberIds: ['me', 'a'] }),
        dm({ id: asChatId('nostr-2'), memberIds: ['me', 'a'] }),
        dm({ id: asChatId('nostr-3'), memberIds: ['me', 'b'] }),
        dm({ id: asChatId('xmtp-1'), protocol: 'xmtp', memberIds: ['me', 'a'] }),
      ],
      self
    );

    const keys = contacts.map((p) => `${p.protocol}-${p.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['nostr-a', 'nostr-b', 'xmtp-a']);
  });
});

describe('contactKey', () => {
  it('round-trips a contact, with or without a protocol', () => {
    const withProtocol = { id: 'bob', protocol: 'xmtp', chatId: 'xmtp-1' };
    const without = { id: 'bob', protocol: undefined, chatId: 'c1' };
    expect(fromContactKey(contactKey(withProtocol))).toEqual(withProtocol);
    expect(fromContactKey(contactKey(without))).toEqual(without);
  });
});

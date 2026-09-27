import { chatScope, inScope } from './chat-scope';
import { asChatId } from './testing/ids';

describe('chatScope', () => {
  it('recognizes a plugin channel', () => {
    expect(chatScope(asChatId('local-bitcoin'))).toBe('channel');
  });

  it('reads a protocol chat from its kind', () => {
    expect(chatScope(asChatId('xmtp-abc'), 'dm')).toBe('dm');
    expect(chatScope(asChatId('xmtp-abc'), 'group')).toBe('group');
    // No kind is the honest default: an id alone cannot tell them apart.
    expect(chatScope(asChatId('xmtp-abc'))).toBe('dm');
  });
});

describe('inScope', () => {
  it('treats an undeclared scope as everywhere', () => {
    expect(inScope(undefined, 'dm')).toBe(true);
    expect(inScope(undefined, 'channel')).toBe(true);
  });

  it('honours a declaration', () => {
    expect(inScope(['group'], 'group')).toBe(true);
    expect(inScope(['group'], 'dm')).toBe(false);
  });
});

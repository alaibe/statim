import { mentionLink } from '@/core/messaging/mentions';

import { fromStatusMentions, toStatusMentions } from './mentions';
import vectors from './testing/status-go-vectors.json';

const [alice, bob] = vectors.keys;
const nameOf = (id: string) => (id === bob.public ? 'Bob' : 'someone');

describe('mentions', () => {
  it('go out as the key Status looks names up by', () => {
    expect(
      toStatusMentions(
        `hi ${mentionLink('Bob', bob.public)}, and **${mentionLink('A]ice', alice.public)}**`
      )
    ).toBe(`hi @${bob.public}, and **@${alice.public}**`);
    expect(toStatusMentions(`ask ${mentionLink('Dan [Telegram]', '12345')}`)).toBe(
      'ask Dan [Telegram]'
    );
    expect(toStatusMentions('[a link](https://status.app)')).toBe('[a link](https://status.app)');
  });

  it('come in as names, from either form of key Status writes', () => {
    expect(fromStatusMentions(`hi @${bob.public}! and @${bob.compressedMultiformat}`, nameOf)).toBe(
      `hi ${mentionLink('Bob', bob.public)}! and ${mentionLink('Bob', bob.public)}`
    );
  });

  it('leave alone what Status would not read as a mention', () => {
    const text = `@${bob.public}x @0x04abc @${bob.compressedMultiformat.slice(0, -4)}`;
    expect(fromStatusMentions(text, nameOf)).toBe(text);
  });
});

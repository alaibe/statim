import { typedEmoji, withFinalEmoji, withTypedEmoji } from './typed-emoji';

const typing = (text: string) =>
  [...text].reduce((value, char) => withTypedEmoji(value, value + char), '');

describe('typed emoji', () => {
  it('turns an emoticon into its emoji once a space follows it', () => {
    expect(typing('nice :) ')).toBe('nice 🙂 ');
    expect(typing(':D ok')).toBe('😄 ok');
    expect(typing('love <3 ')).toBe('love ❤️ ');
    expect(typing('so O:) ')).toBe('so 😇 ');
    expect(typing('nice :)')).toBe('nice :)');
  });

  it('turns a known shortcode into its emoji at its closing colon', () => {
    expect(typing('ship it :rocket:')).toBe('ship it 🚀');
    expect(typing(':nope_not_a_name:')).toBe(':nope_not_a_name:');
    expect(typing('at 10:30:')).toBe('at 10:30:');
  });

  it('leaves emoticons inside words, links and code alone', () => {
    expect(typing('hello:) ')).toBe('hello:) ');
    expect(typing('https://example.com/:p ')).toBe('https://example.com/:p ');
    expect(typing('`a :) ` ')).toBe('`a :) ` ');
    expect(typing('`x` :) ')).toBe('`x` 🙂 ');
  });

  it('leaves a command as typed', () => {
    expect(typing('/poll Lunch? :) ')).toBe('/poll Lunch? :) ');
  });

  it('replaces only around a single typed character, anywhere in the text', () => {
    expect(withTypedEmoji('a :)b', 'a :) b')).toBe('a 🙂 b');
    expect(withTypedEmoji('a', 'a :) ')).toBe('a :) ');
  });

  it('turns the emoticon a message ends on into its emoji when it is sent', () => {
    expect(withFinalEmoji('ok :)')).toBe('ok 🙂');
    expect(withFinalEmoji(':(')).toBe('🙁');
    expect(withFinalEmoji('ok')).toBe('ok');
    expect(withFinalEmoji('/react :)')).toBe('/react :)');
  });

  it('reports where the emoticon sits so a rich field can replace it in place', () => {
    expect(typedEmoji('so ;) ')).toEqual({ from: 3, to: 5, emoji: '😉' });
  });
});

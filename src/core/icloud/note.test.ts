import { noteKey, openNote, sealNote } from './note';

const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const phrase = (value: string) => ({ kind: 'phrase', phrase: value }) as const;

describe('notes for the iPhone', () => {
  it('derives the same key and tag from the same phrase, whatever its spacing or case', () => {
    expect(noteKey(phrase(`  ${PHRASE.toUpperCase()} `))).toEqual(noteKey(phrase(PHRASE)));
    expect(noteKey(phrase(PHRASE)).tag).toMatch(/^[0-9a-f]{16}$/);
    expect(noteKey(phrase(PHRASE.replace('about', 'above')))).not.toEqual(noteKey(phrase(PHRASE)));
  });

  it('derives a wallet account’s key from its chat seed, apart from any phrase', () => {
    const seed = { kind: 'chatSeed', seed: `0x${'ab'.repeat(64)}` } as const;
    expect(noteKey(seed)).toEqual(noteKey({ ...seed }));
    expect(noteKey(seed)).not.toEqual(noteKey(phrase(seed.seed)));
  });

  it('opens what it sealed, and nothing with another key', () => {
    const note = { chat: 'xmtp:abc', title: 'Alice', body: 'Hi 👋' };
    const sealed = sealNote(noteKey(phrase(PHRASE)).key, note);
    expect(openNote(noteKey(phrase(PHRASE)).key, sealed)).toEqual(note);
    expect(openNote(noteKey(phrase(PHRASE.replace('about', 'above'))).key, sealed)).toBeNull();
  });

  it('clips long titles and bodies so the push stays small', () => {
    const { key } = noteKey(phrase(PHRASE));
    const opened = openNote(
      key,
      sealNote(key, { chat: '', title: 'T'.repeat(500), body: '😀'.repeat(1000) })
    );
    expect(Array.from(opened!.title)).toHaveLength(100);
    expect(Array.from(opened!.body)).toHaveLength(300);
    expect(opened!.body.endsWith('…')).toBe(true);
  });

  it('keeps the format the notification extension reads', () => {
    const { key, tag } = noteKey(phrase(PHRASE));
    const sealed = sealNote(
      key,
      { chat: 'xmtp:abc', title: 'Alice', body: 'Hi 👋' },
      new Uint8Array(12).fill(1)
    );
    expect({ key, tag, sealed }).toMatchInlineSnapshot(`
{
  "key": "pMZO2h4/Hn1DqZabD3/4SXgCBkY3ad1mGyHMi3SLG7M=",
  "sealed": "AQEBAQEBAQEBAQEBmQHFXthFMuJub6W0ftDAIbzBKRNU25jrprhnMRq+dzGBkKHh2lfhnpM8r6Ism665HEIh0wff0DbAvX63evKF7YLBQvs=",
  "tag": "df8f46c95392b35e",
}
`);
  });
});

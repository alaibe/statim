import { type Gif, gifToContent, loadGifKey, saveGifKey } from './gifs';

const mockSizes: Record<string, number> = {};

jest.mock('@/core/messaging/media-store', () => ({
  downloadMedia: async (_area: string, name: string, _account: string, url: string) => ({
    uri: `file:///gifs/${name}`,
    size: mockSizes[url],
  }),
}));

const gif: Gif = {
  id: '7',
  previewUrl: 'https://klipy/sm.gif',
  description: 'party',
  files: [
    { url: 'https://klipy/md.gif', width: 480, height: 360, size: 900 * 1024 },
    { url: 'https://klipy/sm.gif', width: 220, height: 165, size: 300 * 1024 },
  ],
};
mockSizes['https://klipy/md.gif'] = 900 * 1024;
mockSizes['https://klipy/sm.gif'] = 300 * 1024;

it('sends the largest GIF where the protocol uploads, and the largest that fits elsewhere', async () => {
  await expect(gifToContent('acct', gif, true)).resolves.toMatchObject({
    uri: 'file:///gifs/7-480.gif',
    width: 480,
  });
  await expect(gifToContent('acct', gif, false)).resolves.toMatchObject({
    uri: 'file:///gifs/7-220.gif',
    width: 220,
  });
});

it('refuses a GIF with no size that fits inside the message', async () => {
  await expect(gifToContent('acct', { ...gif, files: [gif.files[0]] }, false)).rejects.toThrow(
    'too large'
  );
});

describe('gif key storage', () => {
  it('round-trips a key per account', async () => {
    await saveGifKey('acct-1', '  AIzaTestKey123  ');
    expect(await loadGifKey('acct-1')).toBe('AIzaTestKey123');
    expect(await loadGifKey('acct-2')).toBeNull();
  });

  it('clears the key when given an empty string', async () => {
    await saveGifKey('acct-1', 'AIzaTestKey123');
    await saveGifKey('acct-1', '');
    expect(await loadGifKey('acct-1')).toBeNull();
  });
});

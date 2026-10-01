jest.mock('@/core/messaging/media-store', () => ({
  downloadMedia: jest.fn(async (_area: string, name: string) => ({
    uri: `file:///media/stickers/${name}`,
    size: 2048,
  })),
}));

const PACK = { id: 'statim', title: 'Statim', version: 1, stickers: [{ id: 'gm', emoji: '☀️' }] };
const SITE = 'https://statim.laibe.cc/stickers/';

const answer = (...bodies: [unknown, number?][]) => {
  const fetch = jest.spyOn(globalThis, 'fetch');
  for (const [body, status = 200] of bodies)
    fetch.mockResolvedValueOnce(Response.json(body, { status }));
  return fetch;
};

let statimPacks: typeof import('./statim-stickers').statimPacks;
beforeEach(() => {
  jest.isolateModules(() => {
    ({ statimPacks } = jest.requireActual<typeof import('./statim-stickers')>('./statim-stickers'));
  });
});
afterEach(() => jest.restoreAllMocks());

describe('Statim sticker packs', () => {
  it('reads the index once, skipping empty packs, and offers each sticker from the site', async () => {
    const fetch = answer([{ packs: [PACK, { ...PACK, id: 'empty', stickers: [] }] }]);
    const [pack] = await statimPacks('acct');
    expect(await statimPacks('acct')).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(`${SITE}index.json`);

    expect(pack).toMatchObject({
      key: 'statim:statim',
      title: 'Statim',
      cover: `${SITE}statim/gm.webp`,
    });
    expect(await pack.stickers()).toEqual([
      { id: 'gm', emoji: '☀️', preview: `${SITE}statim/gm.webp` },
    ]);
    expect(await pack.content('gm')).toEqual({
      kind: 'sticker',
      uri: 'file:///media/stickers/statim-1-gm.webp',
      mimeType: 'image/webp',
      width: 512,
      height: 512,
      size: 2048,
      emoji: '☀️',
    });
    await expect(pack.content('gone')).rejects.toThrow('no longer in the pack');
  });

  it('says when the site fails and asks again next time; an index it cannot read is empty', async () => {
    answer([{}, 404], [{ packs: [{ id: 'statim' }] }]);
    await expect(statimPacks('acct')).rejects.toThrow('404');
    expect(await statimPacks('acct')).toEqual([]);
  });
});

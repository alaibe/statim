import { gzipSync, strToU8 } from 'fflate';

import { parseLottie } from './lottie';

const animation = { v: '5.5.2', fr: 60, ip: 0, op: 180, w: 512, h: 512, layers: [] };

describe('parseLottie', () => {
  it('unpacks a gzipped Telegram sticker', () => {
    expect(parseLottie(gzipSync(strToU8(JSON.stringify(animation))))).toEqual(animation);
  });

  it('reads Lottie JSON that is not compressed', () => {
    expect(parseLottie(strToU8(JSON.stringify(animation)))).toEqual(animation);
  });
});

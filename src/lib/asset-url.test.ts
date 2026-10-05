import { assetPath } from './asset-url';

describe('assetPath', () => {
  it('reads the file behind an asset URL on every desktop', () => {
    expect(assetPath('asset://localhost/%2FUsers%2Fme%2Fa%20b.jpg')).toBe('/Users/me/a b.jpg');
    expect(assetPath('http://asset.localhost/C%3A%5Cme%5Ca.jpg')).toBe('C:\\me\\a.jpg');
    expect(assetPath('https://asset.localhost/C%3A%5Cme%5Ca.jpg')).toBe('C:\\me\\a.jpg');
  });

  it('leaves other URLs alone', () => {
    expect(assetPath('https://example.org/a.jpg')).toBeNull();
    expect(assetPath('file:///Users/me/a.jpg')).toBeNull();
  });
});

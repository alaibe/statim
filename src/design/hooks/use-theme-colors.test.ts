import { colorsFor } from '../tokens';

/** `useThemeColors` needs a renderer, so this pins the palettes it reads from instead. */
describe('the light and dark palettes', () => {
  it('differ on every surface and content colour', () => {
    const light = colorsFor('light');
    const dark = colorsFor('dark');

    for (const key of ['canvas', 'surface', 'surface-raised', 'content', 'bubble-in'] as const) {
      expect(light[key]).not.toBe(dark[key]);
    }
  });

  it('puts dark on the dark side', () => {
    const luminance = (rgb: string) => {
      const [r, g, b] = rgb
        .replace(/[^\d ]/g, '')
        .trim()
        .split(/\s+/)
        .map(Number);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    expect(luminance(colorsFor('dark').canvas)).toBeLessThan(luminance(colorsFor('light').canvas));
    expect(luminance(colorsFor('dark').content)).toBeGreaterThan(
      luminance(colorsFor('light').content)
    );
  });
});

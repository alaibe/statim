/**
 * The traced mark and the colours around it, for every script that draws it.
 * `trace-brand-mark.js` writes the mark; nothing here edits it.
 */
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '../..');
const mark = readFileSync(join(ROOT, 'assets/brand/mark.svg'), 'utf8');
const attribute = (name) => {
  const match = new RegExp(`${name}="([^"]+)"`).exec(mark);
  if (!match) throw new Error(`mark.svg has no ${name}; run trace-brand-mark first`);
  return match[1];
};

/** Renders SVG markup to a PNG with librsvg (`brew install librsvg`). */
function rasterise(markup, png, width, height = width) {
  execFileSync('rsvg-convert', ['-w', String(width), '-h', String(height), '-o', png], {
    input: markup,
  });
}

module.exports = {
  ROOT,
  CANVAS: 512,
  INK: '#FFFFFF',
  /** The dark splash background; the dark app icon sits on the same colour. */
  NIGHT: '#141A3A',
  PLATE: attribute('data-plate'),
  RADIUS: Number(attribute('data-radius')),
  REACH: Number(attribute('data-reach')),
  PATH: attribute(' d'),
  rasterise,
};

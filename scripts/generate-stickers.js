#!/usr/bin/env node
/**
 * The Statim sticker pack, drawn from the mark and published with the site.
 *
 * Each sticker is an SVG rendered to a 512px WEBP, the size and format every
 * network takes as a sticker, into `docs/public/stickers/`, with the
 * `index.json` the app reads. New artwork replaces what `STICKERS` draws and
 * bumps `PACK.version`, which is what makes the app fetch the files again.
 *
 * Requires librsvg and libwebp (`brew install librsvg webp`) and the Arial
 * Rounded MT Bold that ships with macOS, for the same reason the brand assets
 * do: this runs when the pack changes, not on every install.
 *
 *   npm run stickers:build
 */
const { execFileSync } = require('node:child_process');
const { mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const { CANVAS, INK, NIGHT, PATH, PLATE, RADIUS, ROOT, rasterise } = require('./lib/mark');

const OUT = join(ROOT, 'docs/public/stickers');
const PACK = { id: 'statim', title: 'Statim', version: 1 };
const TMP = join(ROOT, 'node_modules/.cache/stickers');

const SUN = '#FFC83D';
const LOVE = '#E0455A';
const GO = '#2FB67C';
const FONT = 'Arial Rounded MT Bold';

/** The app icon as a die-cut sticker: a white border and a soft shadow. */
function tile({ x = 256, y = 210, size = 300, turn = -6, plate = PLATE } = {}) {
  const scale = size / CANVAS;
  return `<g transform="translate(${x} ${y}) rotate(${turn}) scale(${scale}) translate(-256 -256)">
    <rect x="12" y="26" width="512" height="512" rx="${RADIUS}" fill="${NIGHT}" opacity="0.18"/>
    <rect width="512" height="512" rx="${RADIUS}" fill="${INK}" stroke="${INK}" stroke-width="52"/>
    <rect width="512" height="512" rx="${RADIUS}" fill="${plate}"/>
    <path fill="${INK}" fill-rule="evenodd" d="${PATH}"/>
  </g>`;
}

/** Bold lettering with the same white border as the tile around a dark outline. */
function caption(text, { y = 440, size = 112, fill = INK, turn = -4 } = {}) {
  const common = `x="256" y="${y}" font-family="${FONT}" font-size="${size}" text-anchor="middle" transform="rotate(${turn} 256 ${y})"`;
  return `<text ${common} fill="${INK}" stroke="${INK}" stroke-width="44" stroke-linejoin="round">${text}</text>
    <text ${common} fill="${fill}" stroke="${NIGHT}" stroke-width="16" stroke-linejoin="round" paint-order="stroke">${text}</text>`;
}

const outlined = (shape, fill) =>
  `<g fill="${INK}" stroke="${INK}" stroke-width="28" stroke-linejoin="round">${shape}</g>
    <g fill="${fill}" stroke="${NIGHT}" stroke-width="10" stroke-linejoin="round">${shape}</g>`;

/** A star or a burst: points alternating between `r` and `r * inner`. */
function spikes(cx, cy, r, points, inner, start = 0) {
  const corners = Array.from({ length: points * 2 }, (_, i) => {
    const angle = start + (Math.PI / points) * i;
    const reach = i % 2 === 0 ? r : r * inner;
    return `${(cx + reach * Math.cos(angle)).toFixed(1)},${(cy + reach * Math.sin(angle)).toFixed(1)}`;
  });
  return `<polygon points="${corners.join(' ')}"/>`;
}

const star = (cx, cy, r) => spikes(cx, cy, r, 4, 0.38, -Math.PI / 2);
const burst = (cx, cy, r, points = 12) => spikes(cx, cy, r, points, 0.72);

/** A round badge in the corner with a white mark drawn on it. */
const badge = (fill, d) =>
  outlined(`<circle cx="400" cy="100" r="62"/>`, fill) +
  `<path d="${d}" fill="none" stroke="${INK}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`;

const heart = (cx, cy, s) =>
  `<path d="M ${cx} ${cy + 0.9 * s} C ${cx - 1.6 * s} ${cy - 0.1 * s} ${cx - 1.0 * s} ${cy - 1.2 * s} ${cx} ${cy - 0.45 * s} C ${cx + 1.0 * s} ${cy - 1.2 * s} ${cx + 1.6 * s} ${cy - 0.1 * s} ${cx} ${cy + 0.9 * s} Z"/>`;

const drop = (cx, cy, s) =>
  `<path d="M ${cx} ${cy - s} C ${cx + 0.7 * s} ${cy - 0.1 * s} ${cx + 0.7 * s} ${cy + 0.6 * s} ${cx} ${cy + 0.6 * s} C ${cx - 0.7 * s} ${cy + 0.6 * s} ${cx - 0.7 * s} ${cy - 0.1 * s} ${cx} ${cy - s} Z"/>`;

const STICKERS = [
  {
    id: 'gm',
    emoji: '☀️',
    art: () =>
      outlined(burst(410, 96, 84, 14), SUN) +
      tile({ turn: -8, x: 236 }) +
      caption('gm', { size: 150, fill: SUN }),
  },
  {
    id: 'gn',
    emoji: '🌙',
    art: () =>
      tile({ plate: NIGHT, turn: 6, x: 280 }) +
      outlined(`<path d="M 110 40 A 78 78 0 1 0 170 180 A 60 60 0 1 1 110 40 Z"/>`, SUN) +
      outlined(star(450, 70, 30) + star(470, 150, 18), SUN) +
      caption('gn', { size: 150, turn: 4 }),
  },
  {
    id: 'hi',
    emoji: '👋',
    art: () =>
      `<g fill="none" stroke="${NIGHT}" stroke-width="16" stroke-linecap="round">
        <path d="M 420 90 Q 470 150 440 220"/><path d="M 452 60 Q 520 150 478 250"/>
      </g>` +
      tile({ turn: -12 }) +
      caption('hi!', { size: 140 }),
  },
  {
    id: 'thanks',
    emoji: '🙏',
    art: () =>
      tile({ turn: 4 }) +
      outlined(heart(410, 110, 54), LOVE) +
      outlined(star(92, 96, 34), SUN) +
      caption('thanks', { size: 104 }),
  },
  {
    id: 'lol',
    emoji: '😂',
    art: () =>
      tile({ turn: -16 }) +
      outlined(drop(88, 170, 42) + drop(432, 150, 42), '#5AB8F0') +
      caption('LOL', { size: 136, turn: -8, fill: SUN }),
  },
  {
    id: 'love',
    emoji: '❤️',
    art: () =>
      outlined(heart(256, 235, 170), LOVE) +
      tile({ size: 180, y: 230, turn: -6 }) +
      caption('love', { size: 124, fill: LOVE }),
  },
  {
    id: 'wow',
    emoji: '😮',
    art: () =>
      outlined(burst(256, 205, 215, 16), SUN) +
      tile({ turn: 3, size: 250, y: 205 }) +
      caption('WOW', { size: 128, fill: SUN }),
  },
  {
    id: 'ok',
    emoji: '👌',
    art: () =>
      tile({ turn: -4 }) +
      badge(GO, 'M 372 100 L 394 124 L 432 80') +
      caption('ok', { size: 150, fill: GO }),
  },
  {
    id: 'nope',
    emoji: '🙅',
    art: () =>
      tile({ turn: 8 }) +
      badge(LOVE, 'M 376 76 L 424 124 M 424 76 L 376 124') +
      caption('nope', { size: 124, turn: 4, fill: LOVE }),
  },
  {
    id: 'wagmi',
    emoji: '🚀',
    art: () =>
      outlined(star(80, 90, 36) + star(440, 70, 28) + star(460, 230, 20), SUN) +
      tile({ turn: 0, y: 200 }) +
      caption('wagmi', { size: 108, turn: -2 }),
  },
];

const svg = (art) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">${art}</svg>`;

rmSync(join(OUT, PACK.id), { recursive: true, force: true });
mkdirSync(join(OUT, PACK.id), { recursive: true });
mkdirSync(TMP, { recursive: true });

for (const sticker of STICKERS) {
  const png = join(TMP, `${sticker.id}.png`);
  rasterise(svg(sticker.art()), png, CANVAS);
  execFileSync('cwebp', [
    '-quiet',
    '-q',
    '90',
    '-alpha_q',
    '100',
    png,
    '-o',
    join(OUT, PACK.id, `${sticker.id}.webp`),
  ]);
}
rmSync(TMP, { recursive: true, force: true });

const index = { packs: [{ ...PACK, stickers: STICKERS.map(({ id, emoji }) => ({ id, emoji })) }] };
writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
console.log(`Wrote ${STICKERS.length} stickers to ${OUT}`);

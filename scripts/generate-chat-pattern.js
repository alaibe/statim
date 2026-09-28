/**
 * Draws the repeating motif behind a chat and emits it as a base64 PNG
 * tile in src/design/components/chat-pattern-tile.ts.
 *
 * Why a generated tile instead of drawing the motif in React: one <View> per
 * dot is roughly 180 nodes behind every chat, and every extra bit of
 * detail multiplies that. A tile is a single <Image>
 * with resizeMode="repeat", so the motif can be as dense as we like for a fixed
 * handful of nodes. The pixels carry only alpha, so the component tints them
 * from the palette at runtime and the pattern still follows the theme.
 *
 * Usage: npm run pattern:build
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const outPath = path.join(root, 'src', 'design', 'components', 'chat-pattern-tile.ts');

/**
 * Tile geometry. SIZE is pixels, SCALE is how many of those go into one point,
 * so the motif repeats every SIZE / SCALE pt.
 *
 * 2x rather than 3x on purpose: the pattern is drawn at ~5% opacity, where the
 * extra density is invisible, and dropping it more than halves the bytes we
 * inline into the bundle.
 */
const SIZE = 256;
const SCALE = 2;

/**
 * Antialiasing steps kept in the alpha channel. The tile is drawn at ~5%
 * opacity, so 15 steps of coverage is already finer than the display can
 * resolve, and quantising here roughly halves the deflated size, which is the
 * whole cost of inlining the tiles into the bundle.
 */
const ALPHA_STEPS = 15;

// ---------------------------------------------------------------------------
// Rasteriser
// ---------------------------------------------------------------------------

/**
 * Coverage buffer, 0..1 per pixel. Shapes are combined with max() rather than
 * added so overlapping strokes stay one flat tone: the motif has to read as a
 * single wash, and doubled-up ink at crossings is the kind of contrast that
 * would start competing with message text.
 */
function newBuffer() {
  return new Float64Array(SIZE * SIZE);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function blend(buf, x, y, cov) {
  if (cov <= 0) return;
  const i = y * SIZE + x;
  if (cov > buf[i]) buf[i] = cov;
}

/** Wrapping the write coordinates is what makes the tile seamless. */
function put(buf, x, y, cov) {
  blend(buf, ((x % SIZE) + SIZE) % SIZE, ((y % SIZE) + SIZE) % SIZE, cov);
}

/** Antialiased capsule between two points, `w` px wide. */
function segment(buf, ax, ay, bx, by, w) {
  const ex = bx - ax;
  const ey = by - ay;
  const len2 = ex * ex + ey * ey || 1;
  const r = w / 2;
  const reach = Math.ceil(r + 1);

  // Only visit the pixels the capsule can reach; they get wrapped on write.
  const minX = Math.floor(Math.min(ax, bx) - reach);
  const maxX = Math.ceil(Math.max(ax, bx) + reach);
  const minY = Math.floor(Math.min(ay, by) - reach);
  const maxY = Math.ceil(Math.max(ay, by) + reach);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x - ax;
      const py = y - ay;
      const t = Math.max(0, Math.min(1, (px * ex + py * ey) / len2));
      const dx = px - ex * t;
      const dy = py - ey * t;
      const d = Math.sqrt(dx * dx + dy * dy) - r;
      put(buf, x, y, clamp01(0.5 - d));
    }
  }
}

/** Arc as a short chain of capsules, simpler to reason about than an arc SDF. */
function arc(buf, cx, cy, radius, from, to, w) {
  const span = Math.abs(to - from);
  const steps = Math.max(3, Math.ceil((span * radius) / 2));
  let px = cx + Math.cos(from) * radius;
  let py = cy + Math.sin(from) * radius;
  for (let i = 1; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    const nx = cx + Math.cos(a) * radius;
    const ny = cy + Math.sin(a) * radius;
    segment(buf, px, py, nx, ny, w);
    px = nx;
    py = ny;
  }
}

function disc(buf, cx, cy, radius) {
  const reach = Math.ceil(radius + 1);
  for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++) {
    for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) - radius;
      put(buf, x, y, clamp01(0.5 - d));
    }
  }
}

// ---------------------------------------------------------------------------
// Glyphs
//
// Each draws with a pen in local coordinates (-1..1), which the pen scales by
// the glyph's radius and turns by its angle. The marks are what the app is
// about: locks, keys, sealed letters, birds, a broken chain.
// ---------------------------------------------------------------------------

function pen(buf, cx, cy, r, a, w) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const at = ([x, y]) => [cx + (x * c - y * s) * r, cy + (x * s + y * c) * r];
  const line = (...pts) => {
    for (let i = 1; i < pts.length; i++) segment(buf, ...at(pts[i - 1]), ...at(pts[i]), w);
  };
  return {
    line,
    sub: (x, y, scale) => pen(buf, ...at([x, y]), r * scale, a, w),
    arc: (x, y, radius, from, to) => arc(buf, ...at([x, y]), radius * r, a + from, a + to, w),
    dot: (x, y, radius) => disc(buf, ...at([x, y]), Math.max(radius * r, w * 0.6)),
    bar: (p0, p1, width) => segment(buf, ...at(p0), ...at(p1), width * r),
    curve: (p0, p1, p2, steps = 10) =>
      line(
        ...Array.from({ length: steps + 1 }, (_, i) => {
          const t = i / steps;
          const u = 1 - t;
          return [
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
          ];
        })
      ),
    ellipse: (x, y, rx, ry, steps = 24) =>
      line(
        ...Array.from({ length: steps + 1 }, (_, i) => {
          const t = (i / steps) * Math.PI * 2;
          return [x + Math.cos(t) * rx, y + Math.sin(t) * ry];
        })
      ),
  };
}

/** Closed rounded rectangle, clockwise; `tail` is spliced into the bottom edge. */
function roundRect(x0, y0, x1, y1, k, tail = []) {
  const pts = [];
  const corner = (cx, cy, from) => {
    for (let i = 0; i <= 5; i++) {
      const t = from + (i / 5) * (Math.PI / 2);
      pts.push([cx + Math.cos(t) * k, cy + Math.sin(t) * k]);
    }
  };
  corner(x0 + k, y0 + k, Math.PI);
  corner(x1 - k, y0 + k, Math.PI * 1.5);
  corner(x1 - k, y1 - k, 0);
  pts.push(...tail);
  corner(x0 + k, y1 - k, Math.PI / 2);
  pts.push(pts[0]);
  return pts;
}

function gull(p, x, y, s) {
  p.curve([x - s, y + 0.3 * s], [x - 0.5 * s, y - 0.75 * s], [x, y + 0.2 * s]);
  p.curve([x, y + 0.2 * s], [x + 0.5 * s, y - 0.75 * s], [x + s, y + 0.3 * s]);
}

function keyhole(p, x, y, s) {
  p.dot(x, y - 0.1 * s, 0.2 * s);
  p.bar([x, y - 0.05 * s], [x, y + 0.34 * s], 0.16 * s);
}

function speech(p, flip) {
  const body = roundRect(-0.92, -0.66, 0.92, 0.4, 0.34, [
    [-0.3, 0.4],
    [-0.78, 0.82],
  ]);
  p.line(...(flip ? body.map(([x, y]) => [-x, y]) : body));
}

const GLYPHS = {
  lock: (p) => {
    p.line(...roundRect(-0.62, -0.1, 0.62, 0.84, 0.16));
    p.line([-0.36, -0.1], [-0.36, -0.38]);
    p.line([0.36, -0.1], [0.36, -0.38]);
    p.arc(0, -0.38, 0.36, Math.PI, Math.PI * 2);
    keyhole(p, 0, 0.36, 0.7);
  },

  key: (p) => {
    p.arc(-0.56, 0, 0.3, 0, Math.PI * 2);
    p.line([-0.26, 0], [0.92, 0]);
    p.line([0.62, 0], [0.62, 0.28]);
    p.line([0.86, 0], [0.86, 0.32]);
  },

  keyhole: (p) => {
    p.arc(0, 0, 0.84, 0, Math.PI * 2);
    keyhole(p, 0, 0, 1.3);
  },

  shield: (p) => {
    p.line([0, -0.9], [0.72, -0.64], [0.72, 0]);
    p.curve([0.72, 0], [0.7, 0.62], [0, 0.92]);
    p.curve([0, 0.92], [-0.7, 0.62], [-0.72, 0]);
    p.line([-0.72, 0], [-0.72, -0.64], [0, -0.9]);
    p.line([-0.3, 0.02], [-0.07, 0.26], [0.32, -0.22]);
  },

  envelope: (p) => {
    p.line(...roundRect(-0.9, -0.6, 0.9, 0.6, 0.12));
    p.line([-0.84, -0.52], [0, 0.1], [0.84, -0.52]);
  },

  plane: (p) => {
    const tip = [0.9, -0.9];
    const fold = [-0.09, 0.09];
    p.line(tip, [0.27, 0.9], fold, [-0.9, -0.27], tip);
    p.line(tip, fold);
  },

  birds: (p) => {
    gull(p, -0.15, 0.3, 0.9);
    gull(p, 0.62, -0.55, 0.5);
  },

  signal: (p) => {
    p.dot(0, 0, 0.14);
    for (const radius of [0.46, 0.84]) {
      p.arc(0, 0, radius, -0.62, 0.62);
      p.arc(0, 0, radius, Math.PI - 0.62, Math.PI + 0.62);
    }
  },

  globe: (p) => {
    p.arc(0, 0, 0.86, 0, Math.PI * 2);
    p.ellipse(0, 0, 0.38, 0.86);
    p.line([-0.86, 0], [0.86, 0]);
  },

  chain: (p) => {
    p.line(...roundRect(-1.1, -0.36, -0.16, 0.36, 0.36));
    p.line(...roundRect(0.16, -0.36, 1.1, 0.36, 0.36));
    for (const k of [-1, 1]) {
      p.line([0, k * 0.5], [0, k * 0.8]);
      p.line([-0.2 * k, k * 0.48], [-0.38 * k, k * 0.72]);
    }
  },

  feather: (p) => {
    p.curve([-0.6, 0.6], [-0.62, -0.5], [0.82, -0.82]);
    p.curve([-0.6, 0.6], [0.5, 0.62], [0.82, -0.82]);
    p.line([-0.95, 0.95], [0.4, -0.4]);
  },

  sparkle: (p) => {
    const tips = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    for (let i = 0; i < 4; i++) p.curve(tips[i], [0, 0], tips[(i + 1) % 4], 8);
  },

  dots: (p) => {
    for (const x of [-0.7, 0, 0.7]) p.dot(x, 0, 0.24);
  },

  seeds: (p) => {
    for (let i = 0; i < 3; i++) {
      const t = (i * Math.PI * 2) / 3;
      p.dot(Math.cos(t) * 0.5, Math.sin(t) * 0.5, 0.18);
    }
  },

  ring: (p) => p.arc(0, 0, 0.78, 0, Math.PI * 2),

  bird: (p) => gull(p, 0, 0, 1),

  chat: (p) => speech(p, false),

  chatDots: (p) => {
    speech(p, true);
    for (const x of [-0.4, 0, 0.4]) p.dot(x, -0.13, 0.1);
  },

  chatKeyhole: (p) => {
    speech(p, false);
    keyhole(p, 0, -0.1, 0.9);
  },

  chatLock: (p) => {
    speech(p, true);
    GLYPHS.lock(p.sub(0, -0.14, 0.36));
  },
};

/** [base angle, spread either side]. Upright marks only lean; loose ones turn freely. */
const TILT = {
  key: [-Math.PI / 4, 0.7],
  chain: [-Math.PI / 4, 0.4],
  feather: [0, 0.5],
  sparkle: [0, Math.PI],
  seeds: [0, Math.PI],
};
const DEFAULT_TILT = [0, 0.3];

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

/** Deterministic PRNG so a rebuild produces byte-identical output. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function wrapDistance(a, b) {
  const dx = Math.abs(a - b) % SIZE;
  return Math.min(dx, SIZE - dx);
}

/**
 * Dart-throwing scatter: a mark lands only where it clears every mark already
 * placed, measured across the tile's wrap so the seams stay invisible. Names
 * are dealt from a shuffled deck so each mark turns up about equally often.
 */
function scatter(buf, placed, { seed, count, radius, gap, width, names }) {
  const rand = rng(seed);
  const deck = Array.from({ length: count }, (_, i) => names[i % names.length]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  let n = 0;
  for (let tries = 0; tries < 20000 && n < count; tries++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const r = radius * (0.88 + rand() * 0.24);
    const clear = placed.every(
      (q) => Math.hypot(wrapDistance(q.x, x), wrapDistance(q.y, y)) >= q.r + r + gap
    );
    if (!clear) continue;
    placed.push({ x, y, r });
    const name = deck[n++];
    const [base, spread] = TILT[name] ?? DEFAULT_TILT;
    GLYPHS[name](pen(buf, x, y, r, base + (rand() - 0.5) * 2 * spread, width));
  }
  if (n < count) throw new Error(`scatter ${seed.toString(16)}: placed ${n} of ${count}`);
}

const PATTERNS = {
  doodles(buf) {
    const placed = [];
    scatter(buf, placed, {
      seed: 0x5eed01,
      count: 30,
      radius: 15,
      gap: 7,
      width: 2,
      names: [
        'lock',
        'key',
        'keyhole',
        'shield',
        'envelope',
        'plane',
        'birds',
        'signal',
        'globe',
        'chain',
        'feather',
        'sparkle',
      ],
    });
    scatter(buf, placed, {
      seed: 0x5eed02,
      count: 40,
      radius: 5.5,
      gap: 5,
      width: 1.7,
      names: ['dots', 'sparkle', 'seeds', 'ring', 'bird'],
    });
  },

  bubbles(buf) {
    const placed = [];
    scatter(buf, placed, {
      seed: 0xb0bb1e,
      count: 12,
      radius: 22,
      gap: 12,
      width: 2,
      names: ['chat', 'chatDots', 'chatKeyhole', 'chatLock'],
    });
    scatter(buf, placed, {
      seed: 0xb0bb2e,
      count: 24,
      radius: 5.5,
      gap: 7,
      width: 1.7,
      names: ['ring', 'seeds', 'bird'],
    });
  },
};

// ---------------------------------------------------------------------------
// PNG encoding
//
// Written by hand rather than pulled from npm: this runs once at authoring time
// and a short encoder is cheaper than a dependency.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Grey + alpha, with grey pinned at 255. Only the alpha channel carries the
 * drawing: the component supplies the colour through tintColor, which is what
 * lets one tile serve both themes.
 */
function encodePng(buf) {
  const bpp = 2;
  const stride = SIZE * bpp;
  const raw = Buffer.alloc(stride * SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    raw[i * 2] = 255;
    raw[i * 2 + 1] = Math.round(clamp01(buf[i]) * ALPHA_STEPS) * (255 / ALPHA_STEPS);
  }

  // Per-scanline adaptive filtering, the standard minimum-sum-of-absolute-
  // differences heuristic. Worth it here: it takes the constant grey channel to
  // all zeroes, which is most of the file.
  const filtered = Buffer.alloc((stride + 1) * SIZE);
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  const candidates = Array.from({ length: 5 }, () => Buffer.alloc(stride));

  for (let y = 0; y < SIZE; y++) {
    raw.copy(line, 0, y * stride, (y + 1) * stride);
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = candidates[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? line[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        const x = line[i];
        const v =
          f === 0
            ? x
            : f === 1
              ? x - a
              : f === 2
                ? x - b
                : f === 3
                  ? x - ((a + b) >> 1)
                  : x - paeth(a, b, c);
        out[i] = v & 0xff;
        score += out[i] < 128 ? out[i] : 256 - out[i];
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    filtered[y * (stride + 1)] = best;
    candidates[best].copy(filtered, y * (stride + 1) + 1);
    line.copy(prev);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 4; // colour type: grey + alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(filtered, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

const entries = Object.entries(PATTERNS).map(([name, draw]) => {
  const buf = newBuffer();
  draw(buf);
  return [name, encodePng(buf)];
});

const body = entries
  .map(([name, png]) => `  ${name}: 'data:image/png;base64,${png.toString('base64')}',`)
  .join('\n');

const ts = `export const CHAT_PATTERN_SCALE = ${SCALE};

export const CHAT_PATTERN_SIZE = ${SIZE};

export const CHAT_PATTERNS = {
${body}
} as const;

export type ChatPatternName = keyof typeof CHAT_PATTERNS;
`;

fs.writeFileSync(outPath, ts);

// Exposed so a scratch script can composite a preview over the real palette
// when tuning the motif; nothing in the app imports this file.
module.exports = { SIZE, SCALE, PATTERNS, newBuffer };

const report = entries
  .map(([name, png]) => `${name} ${(png.length / 1024).toFixed(1)}kB`)
  .join(', ');
console.log(
  `pattern: ${SIZE}px @${SCALE}x (${SIZE / SCALE}pt tile): ${report} -> ${path.relative(root, outPath)}`
);

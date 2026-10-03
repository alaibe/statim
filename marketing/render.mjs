import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'docs/public/promo');
const FPS = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const shells = existsSync(cache)
    ? readdirSync(cache)
        .filter((d) => d.startsWith('chromium_headless_shell-'))
        .sort()
        .reverse()
        .map((d) => join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell'))
    : [];
  const found = [...shells, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(
    existsSync
  );
  if (!found)
    throw new Error('No Chrome found. Set CHROME to a Chrome or chrome-headless-shell binary.');
  return found;
}

for (const tool of ['ffmpeg', 'img2webp']) {
  try {
    execFileSync('which', [tool], { stdio: 'ignore' });
  } catch {
    throw new Error(`${tool} is missing: brew install ffmpeg webp`);
  }
}

const work = mkdtempSync(join(tmpdir(), 'promo-'));
const page = join(work, 'film.html');
writeFileSync(
  page,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${readFileSync(join(root, 'marketing/film.html'), 'utf8')}</body></html>`
);

async function render(format, port, file) {
  const [W, H] = format === 'portrait' ? [1080, 1920] : [1920, 1080];
  const chrome = spawn(
    findChrome(),
    [
      '--headless',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${join(work, `profile-${port}`)}`,
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${W},${H}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  try {
    let target;
    for (let i = 0; i < 100 && !target; i++) {
      await sleep(200);
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        target = list.find((t) => t.type === 'page');
      } catch {}
    }
    if (!target) throw new Error('Chrome did not start');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      const call = pending.get(msg.id);
      if (!call) return;
      pending.delete(msg.id);
      msg.error ? call.reject(new Error(msg.error.message)) : call.resolve(msg.result);
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        pending.set(++id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails)
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: W,
      height: H,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'prefers-color-scheme', value: 'light' },
        { name: 'prefers-reduced-motion', value: 'no-preference' },
      ],
    });
    await send('Page.navigate', { url: pathToFileURL(page).href });
    for (let i = 0; i < 100; i++) {
      await sleep(100);
      if (
        await evaluate('document.readyState === "complete" && typeof film === "object"').catch(
          () => false
        )
      )
        break;
    }
    const fonts = await evaluate(`(async () => {
      const s = document.createElement('style');
      s.textContent = '.page{padding:0!important;display:block!important}#controls{display:none!important}.frame{width:${W}px!important;height:${H}px!important;border-radius:0!important;box-shadow:none!important}.stage{transform:none!important}';
      document.head.append(s);
      film.format('${format}');
      await document.fonts.load('600 92px "Familjen Grotesk"');
      await document.fonts.load('400 23px "JetBrains Mono"');
      await document.fonts.ready;
      return document.fonts.check('600 92px "Familjen Grotesk"') && document.fonts.check('400 23px "JetBrains Mono"');
    })()`);
    if (!fonts) throw new Error('Google Fonts did not load');

    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'image2pipe',
        '-c:v',
        'png',
        '-framerate',
        String(FPS),
        '-i',
        '-',
      ].concat([
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '17',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        file,
      ]),
      { stdio: ['pipe', 'inherit', 'inherit'] }
    );
    const frames = Math.round((await evaluate('film.duration')) * FPS);
    for (let i = 0; i < frames; i++) {
      await evaluate(`film.seek(${(i / FPS).toFixed(5)})`);
      const { data } = await send('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: W, height: H, scale: 1 },
      });
      if (!ffmpeg.stdin.write(Buffer.from(data, 'base64')))
        await new Promise((r) => ffmpeg.stdin.once('drain', r));
      if (i % 300 === 0) console.log(`${format}: frame ${i} of ${frames}`);
    }
    ffmpeg.stdin.end();
    await new Promise((r) => ffmpeg.on('close', r));
    ws.close();
  } finally {
    chrome.kill();
  }
}

mkdirSync(out, { recursive: true });
const wide = join(out, 'film-16x9.mp4');
await Promise.all([
  render('landscape', 9333, wide),
  render('portrait', 9334, join(out, 'film-9x16.mp4')),
]);

for (const cut of ['16x9', '9x16']) {
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    '8.5',
    '-i',
    join(out, `film-${cut}.mp4`),
    '-frames:v',
    '1',
    '-q:v',
    '3',
    join(out, `film-poster-${cut}.jpg`),
  ]);
}
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-ss',
  '16',
  '-i',
  wide,
  '-frames:v',
  '1',
  '-vf',
  'crop=1920:1008,scale=1200:630:flags=lanczos',
  '-q:v',
  '3',
  join(out, 'og.jpg'),
]);
const stills = join(work, 'webp');
mkdirSync(stills);
execFileSync('ffmpeg', [
  '-loglevel',
  'error',
  '-i',
  wide,
  '-vf',
  'fps=12,scale=960:-2:flags=lanczos',
  join(stills, '%04d.png'),
]);
const pngs = readdirSync(stills)
  .sort()
  .map((f) => join(stills, f));
execFileSync('img2webp', [
  '-loop',
  '0',
  '-mixed',
  '-q',
  '70',
  '-m',
  '6',
  '-d',
  String(Math.round(1000 / 12)),
  ...pngs,
  '-o',
  join(out, 'film.webp'),
]);

rmSync(work, { recursive: true, force: true });
console.log(`wrote ${readdirSync(out).join(', ')} to docs/public/promo`);

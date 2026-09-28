import { concat } from '@/lib/bytes';

import { AudioType } from './messages';

export interface StatusAudio {
  payload: Uint8Array;
  type: number;
}

interface Box {
  type: string;
  start: number;
  body: number;
  end: number;
}

interface AacConfig {
  objectType: number;
  frequencyIndex: number;
  channels: number;
}

const AMR_MAGIC = Uint8Array.of(0x23, 0x21, 0x41, 0x4d, 0x52, 0x0a);

/**
 * Status plays a voice note as bare ADTS AAC or as an AMR file, which is what
 * its own recorder writes. Phones and browsers record into MP4 or 3GP, so the
 * frames come out of that container.
 */
export function statusAudio(bytes: Uint8Array): StatusAudio | null {
  if (bytes[0] === 0xff && (bytes[1] === 0xf1 || bytes[1] === 0xf9)) {
    return { payload: bytes, type: AudioType.AAC };
  }
  if (AMR_MAGIC.every((byte, i) => bytes[i] === byte)) {
    return { payload: bytes, type: AudioType.AMR };
  }
  try {
    return new Container(bytes).audio();
  } catch {
    return null;
  }
}

function adtsHeader({ objectType, frequencyIndex, channels }: AacConfig, size: number) {
  const length = size + 7;
  return Uint8Array.of(
    0xff,
    0xf1,
    ((objectType - 1) << 6) | (frequencyIndex << 2) | (channels >> 2),
    ((channels & 3) << 6) | (length >> 11),
    (length >> 3) & 0xff,
    ((length & 7) << 5) | 0x1f,
    0xfc
  );
}

function readAacConfig(bytes: Uint8Array): AacConfig | null {
  let at = 0;
  const open = (tag: number): number | null => {
    if (bytes[at++] !== tag) return null;
    let length = 0;
    for (let i = 0; i < 4; i++) {
      const byte = bytes[at++];
      length = (length << 7) | (byte & 0x7f);
      if (!(byte & 0x80)) break;
    }
    return length;
  };
  if (open(0x03) === null) return null;
  const flags = bytes[at + 2];
  at += 3;
  if (flags & 0x80) at += 2;
  if (flags & 0x40) at += 1 + bytes[at];
  if (flags & 0x20) at += 2;
  if (open(0x04) === null) return null;
  at += 13;
  const length = open(0x05);
  if (length === null || length < 2) return null;
  const objectType = bytes[at] >> 3;
  const frequencyIndex = ((bytes[at] & 0x07) << 1) | (bytes[at + 1] >> 7);
  const channels = (bytes[at + 1] >> 3) & 0x0f;
  if (objectType < 1 || objectType > 4 || frequencyIndex > 12 || channels < 1 || channels > 7) {
    return null;
  }
  return { objectType, frequencyIndex, channels };
}

class Container {
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  audio(): StatusAudio | null {
    const moov = this.child(null, 'moov');
    if (!moov) return null;
    for (const trak of this.children(moov, 'trak')) {
      const stbl = this.path(trak, ['mdia', 'minf', 'stbl']);
      const stsd = stbl && this.child(stbl, 'stsd');
      const entry = stsd && [...this.boxes(stsd.body + 8, stsd.end)][0];
      if (!stbl || !entry || (entry.type !== 'mp4a' && entry.type !== 'samr')) continue;
      const samples = [...this.tableSamples(stbl), ...this.fragmentSamples(moov)];
      if (samples.length === 0) return null;
      if (entry.type === 'samr') {
        return { payload: concat([AMR_MAGIC, ...samples]), type: AudioType.AMR };
      }
      const config = this.aacConfig(entry);
      if (!config) return null;
      const frames = samples.flatMap((sample) => [adtsHeader(config, sample.length), sample]);
      return { payload: concat(frames), type: AudioType.AAC };
    }
    return null;
  }

  private *boxes(start: number, end: number): Generator<Box> {
    let at = start;
    while (at + 8 <= end) {
      let size = this.u32(at);
      let body = at + 8;
      if (size === 1) {
        size = this.u64(at + 8);
        body += 8;
      } else if (size === 0) {
        size = end - at;
      }
      if (size < body - at || at + size > end) return;
      const type = String.fromCharCode(...this.bytes.subarray(at + 4, at + 8));
      yield { type, start: at, body, end: at + size };
      at += size;
    }
  }

  private children(parent: Box | null, type: string): Box[] {
    const [start, end] = parent ? [parent.body, parent.end] : [0, this.bytes.length];
    return [...this.boxes(start, end)].filter((box) => box.type === type);
  }

  private child(parent: Box | null, type: string): Box | undefined {
    return this.children(parent, type)[0];
  }

  private path(parent: Box, types: string[]): Box | undefined {
    let box: Box | undefined = parent;
    for (const type of types) box = box && this.child(box, type);
    return box;
  }

  private u32(at: number): number {
    return this.view.getUint32(at);
  }

  private u64(at: number): number {
    return this.u32(at) * 2 ** 32 + this.u32(at + 4);
  }

  private slice(start: number, size: number): Uint8Array {
    if (start + size > this.bytes.length) throw new RangeError('A sample runs past the file.');
    return this.bytes.subarray(start, start + size);
  }

  private aacConfig(entry: Box): AacConfig | null {
    const version = this.view.getUint16(entry.body + 8);
    const start = entry.body + 28 + (version === 1 ? 16 : version === 2 ? 36 : 0);
    const esds = [...this.boxes(start, entry.end)].find((box) => box.type === 'esds');
    return esds ? readAacConfig(this.bytes.subarray(esds.body + 4, esds.end)) : null;
  }

  private tableSamples(stbl: Box): Uint8Array[] {
    const stsz = this.child(stbl, 'stsz');
    const stsc = this.child(stbl, 'stsc');
    const stco = this.child(stbl, 'stco') ?? this.child(stbl, 'co64');
    if (!stsz || !stsc || !stco) return [];
    const fixedSize = this.u32(stsz.body + 4);
    const count = this.u32(stsz.body + 8);
    const runs = this.u32(stsc.body + 4);
    const chunks = this.u32(stco.body + 4);
    const samples: Uint8Array[] = [];
    let run = 0;
    for (let chunk = 0; runs > 0 && chunk < chunks && samples.length < count; chunk++) {
      while (run + 1 < runs && this.u32(stsc.body + 8 + 12 * (run + 1)) <= chunk + 1) run++;
      let offset =
        stco.type === 'co64'
          ? this.u64(stco.body + 8 + 8 * chunk)
          : this.u32(stco.body + 8 + 4 * chunk);
      const perChunk = this.u32(stsc.body + 12 + 12 * run);
      for (let i = 0; i < perChunk && samples.length < count; i++) {
        const size = fixedSize || this.u32(stsz.body + 12 + 4 * samples.length);
        samples.push(this.slice(offset, size));
        offset += size;
      }
    }
    return samples;
  }

  private fragmentSamples(moov: Box): Uint8Array[] {
    const trex = this.path(moov, ['mvex', 'trex']);
    const trexSize = trex ? this.u32(trex.body + 16) : 0;
    const samples: Uint8Array[] = [];
    for (const moof of this.children(null, 'moof')) {
      for (const traf of this.children(moof, 'traf')) {
        const tfhd = this.child(traf, 'tfhd');
        if (!tfhd) continue;
        const flags = this.u32(tfhd.body) & 0xffffff;
        let field = tfhd.body + 8;
        let base = moof.start;
        if (flags & 0x01) {
          base = this.u64(field);
          field += 8;
        }
        if (flags & 0x02) field += 4;
        if (flags & 0x08) field += 4;
        const defaultSize = flags & 0x10 ? this.u32(field) : trexSize;
        let next = base;
        for (const trun of this.children(traf, 'trun')) {
          const runFlags = this.u32(trun.body) & 0xffffff;
          const count = this.u32(trun.body + 4);
          let at = trun.body + 8;
          if (runFlags & 0x01) {
            next = base + this.view.getInt32(at);
            at += 4;
          }
          if (runFlags & 0x04) at += 4;
          for (let i = 0; i < count; i++) {
            if (runFlags & 0x100) at += 4;
            const size = runFlags & 0x200 ? this.u32(at) : defaultSize;
            if (runFlags & 0x200) at += 4;
            if (runFlags & 0x400) at += 4;
            if (runFlags & 0x800) at += 4;
            samples.push(this.slice(next, size));
            next += size;
          }
        }
      }
    }
    return samples;
  }
}

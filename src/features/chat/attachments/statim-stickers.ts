import { HttpError } from '@/core/errors';
import { downloadMedia } from '@/core/messaging/media-store';
import { arrayOf, isNumber, isString, shape } from '@/lib/guards';
import { SITE } from '@/lib/guide';

import type { PickerPack } from '@/core/messaging/stickers';

/** Where the site publishes the packs, ending in `/`; a local copy of `docs/public/stickers/` while developing. */
const PACKS = process.env.EXPO_PUBLIC_STICKERS_URL ?? `${SITE}stickers/`;
const SIDE = 512;
const TIMEOUT_MS = 5_000;

interface HostedSticker {
  id: string;
  emoji: string;
}

interface HostedPack {
  id: string;
  title: string;
  /** Part of each kept file's name, so new artwork is fetched again. */
  version: number;
  stickers: HostedSticker[];
}

const isIndex = shape<{ packs: HostedPack[] }>({
  packs: arrayOf(
    shape<HostedPack>({
      id: isString,
      title: isString,
      version: isNumber,
      stickers: arrayOf(shape<HostedSticker>({ id: isString, emoji: isString })),
    })
  ),
});

let index: Promise<HostedPack[]> | undefined;

/** Statim's own packs, read from the site once per launch; a failed read is tried again next time. */
export function statimPacks(accountId: string): Promise<PickerPack[]> {
  index ??= readIndex().catch((error: unknown) => {
    index = undefined;
    throw error;
  });
  return index.then((packs) => packs.map((pack) => pickerPack(accountId, pack)));
}

async function readIndex(): Promise<HostedPack[]> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${PACKS}index.json`, { signal: abort.signal });
    if (!response.ok) {
      throw new HttpError(
        response.status,
        `Could not load the Statim stickers (${response.status})`
      );
    }
    const body: unknown = await response.json();
    return isIndex(body) ? body.packs.filter((pack) => pack.stickers.length > 0) : [];
  } finally {
    clearTimeout(timer);
  }
}

function pickerPack(accountId: string, pack: HostedPack): PickerPack {
  const url = (sticker: HostedSticker) => `${PACKS}${pack.id}/${sticker.id}.webp`;
  return {
    key: `statim:${pack.id}`,
    title: pack.title,
    cover: url(pack.stickers[0]),
    stickers: async () =>
      pack.stickers.map((sticker) => ({
        id: sticker.id,
        emoji: sticker.emoji,
        preview: url(sticker),
      })),
    content: async (stickerId) => {
      const sticker = pack.stickers.find((each) => each.id === stickerId);
      if (!sticker) throw new Error('That sticker is no longer in the pack.');
      const file = await downloadMedia(
        'stickers',
        `${pack.id}-${pack.version}-${sticker.id}.webp`,
        accountId,
        url(sticker)
      );
      return {
        kind: 'sticker',
        uri: file.uri,
        mimeType: 'image/webp',
        width: SIDE,
        height: SIDE,
        size: file.size,
        emoji: sticker.emoji,
      };
    },
  };
}

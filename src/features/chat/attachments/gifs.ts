import { downloadMedia } from '@/core/messaging/media-store';

import { HttpError } from '@/core/errors';
import { readCredential, writeCredential } from '@/core/account/credentials';
import { INLINE_LIMIT_BYTES } from '@/core/messaging/attachments';
import type { MessageContent } from '@/core/messaging/types';

interface GifFile {
  url: string;
  width: number;
  height: number;
  size: number;
}

export interface Gif {
  id: string;
  /** Largest first. */
  files: GifFile[];
  previewUrl: string;
  description: string;
}

export const loadGifKey = (accountId: string) => readCredential(accountId, 'gifs');
export const saveGifKey = (accountId: string, key: string) =>
  writeCredential(accountId, 'gifs', key);

export function searchGifs(key: string, query: string, limit = 24): Promise<Gif[]> {
  return fetchGifs(key, `search?q=${encodeURIComponent(query)}&per_page=${limit}`);
}

/** What KLIPY is showing everyone right now: the grid before a search. */
export function featuredGifs(key: string, limit = 30): Promise<Gif[]> {
  return fetchGifs(key, `trending?per_page=${limit}`);
}

async function fetchGifs(key: string, path: string): Promise<Gif[]> {
  const response = await fetch(
    `https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/${path}&rating=pg`
  );
  if (!response.ok) {
    // KLIPY answers an unknown key with 404, not 401.
    throw new HttpError(
      response.status,
      [401, 403, 404].includes(response.status)
        ? 'That GIF key was rejected. Check it in Settings.'
        : `GIF search failed (${response.status})`
    );
  }

  const body = (await response.json()) as {
    data?: {
      data?: {
        id: number;
        title?: string;
        type?: string;
        file?: Partial<Record<'xs' | 'sm' | 'md' | 'hd', { gif?: GifFile }>>;
      }[];
    };
  };

  return (body.data?.data ?? [])
    .map((item) => {
      // Results can interleave `type: 'ad'` items.
      const { md, sm, xs } = item.file ?? {};
      const files = [md?.gif, sm?.gif, xs?.gif].filter((f): f is GifFile => f !== undefined);
      if (item.type !== 'gif' || !sm?.gif) return null;
      return {
        id: String(item.id),
        files,
        previewUrl: sm.gif.url,
        description: item.title ?? 'GIF',
      };
    })
    .filter((g): g is Gif => g !== null);
}

export async function gifToContent(
  accountId: string,
  gif: Gif,
  largeFiles: boolean
): Promise<MessageContent> {
  const fits = (size: number) => largeFiles || size <= INLINE_LIMIT_BYTES;
  const chosen = gif.files.find((f) => fits(f.size));
  if (!chosen) throw new Error('That GIF is too large to send inline.');
  const file = await downloadMedia('gifs', `${gif.id}-${chosen.width}.gif`, accountId, chosen.url);
  if (!fits(file.size)) throw new Error('That GIF is too large to send inline.');

  return {
    kind: 'image',
    uri: file.uri,
    width: chosen.width,
    height: chosen.height,
    size: file.size,
    name: `${gif.id}.gif`,
    mimeType: 'image/gif',
    caption: undefined,
  };
}

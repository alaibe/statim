import { persistedCache } from '@/lib/persisted-cache';
import type { AccountStorage } from '@/storage/account';
import { fetchLinkPreview, type LinkPreview } from './link-preview';

const previews = persistedCache<LinkPreview | null>({
  name: 'link-previews',
  limit: 300,
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  // A miss may only mean the device was offline or the site slow to answer.
  missTtlMs: 10 * 60 * 1000,
});

export function hydrateLinkPreviewCache(target: AccountStorage): Promise<void> {
  return previews.hydrate(target);
}

export function clearLinkPreviewCache(): void {
  previews.clear();
}

export function cachedLinkPreview(url: string): LinkPreview | null | undefined {
  return previews.peek(url);
}

/** One request per URL, remembered across launches for a week. */
export function loadLinkPreview(url: string): Promise<LinkPreview | null> {
  return previews.load(url, () => fetchLinkPreview(url));
}

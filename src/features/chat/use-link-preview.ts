import type { LinkPreview } from '@/core/messaging/link-preview';
import { cachedLinkPreview, loadLinkPreview } from '@/core/messaging/link-preview-cache';
import { useKeyedLoad } from '@/lib/use-keyed-load';

/** `null` while loading or when the site gave nothing. */
export function useLinkPreview(url: string | null): LinkPreview | null {
  const loaded = useKeyedLoad(url, loadLinkPreview);
  if (url && loaded.loading) return cachedLinkPreview(url) ?? null;
  return loaded.value ?? null;
}

const ASSET_URL = /^(?:asset:\/\/localhost|https?:\/\/asset\.localhost)\//;

/** The file behind a `convertFileSrc` URL: `asset://localhost/…`, or `http://asset.localhost/…` on Windows. */
export function assetPath(uri: string): string | null {
  return ASSET_URL.test(uri) ? decodeURIComponent(uri.replace(ASSET_URL, '')) : null;
}

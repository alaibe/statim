import { openPath, openUrl } from '@tauri-apps/plugin-opener';

import { assetPath } from './asset-url';

// The desktop window has no in-app browser: everything goes to the system,
// and a stored attachment opens in whatever handles its type.
export function openInBrowser(url: string, _options?: { fullScreen?: boolean }): Promise<unknown> {
  const path = assetPath(url);
  return path ? openPath(path) : openUrl(url);
}

export function openExternal(url: string): Promise<void> {
  return openUrl(url);
}

export async function canOpenExternal(url: string): Promise<boolean> {
  return /^(https?|mailto|tel|sms):/i.test(url);
}

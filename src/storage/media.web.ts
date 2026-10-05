import { convertFileSrc, invoke } from '@tauri-apps/api/core';

import { assetPath } from '@/lib/asset-url';

import { pathOfFileUri as filePath } from './file-uri';
import type { FileArea } from './inventory';

export async function eraseMedia(accountId: string): Promise<void> {
  await invoke('media_erase', { accountId });
}

export function accountDirectory(area: FileArea, accountId: string): Promise<string> {
  return invoke('account_dir', { area, accountId });
}

export function eraseAccountDirectory(area: FileArea, accountId: string): Promise<void> {
  return invoke('erase_account_dir', { area, accountId });
}

export function localFileUri(path: string): string {
  return convertFileSrc(path);
}

/** Media the window shows through Tauri's asset protocol is still a file on disk. */
export function pathOfFileUri(uri: string): string {
  return assetPath(uri) ?? filePath(uri);
}

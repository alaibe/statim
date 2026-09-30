import { localFileUri } from '@/storage/media';

import type { TdApi } from './api';
import type { TdFile } from './types';

const download = (api: TdApi, file: TdFile, priority: number, synchronous: boolean) =>
  api.send<TdFile>({
    '@type': 'downloadFile',
    file_id: file.id,
    priority,
    offset: 0,
    limit: 0,
    synchronous,
  });

/** Waits for TDLib to have the file on disk. */
export async function localFile(api: TdApi, file: TdFile, priority: number): Promise<string> {
  const local = file.local.is_downloading_completed
    ? file
    : await download(api, file, priority, true);
  if (!local.local.is_downloading_completed || !local.local.path)
    throw new Error('Telegram could not download that file.');
  return localFileUri(local.local.path);
}

/** The file when it is on disk already; otherwise TDLib starts fetching it and there is nothing yet. */
export function localFileSoon(api: TdApi, file: TdFile, priority: number): string | undefined {
  if (file.local.is_downloading_completed && file.local.path) return localFileUri(file.local.path);
  download(api, file, priority, false).catch(() => {});
  return undefined;
}

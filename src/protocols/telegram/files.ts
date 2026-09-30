import { localFileUri } from '@/storage/media';

import type { TdApi } from './api';
import type { TdFile } from './types';

export function localUriOf(file: TdFile): string | undefined {
  return file.local.is_downloading_completed && file.local.path
    ? localFileUri(file.local.path)
    : undefined;
}

export const download = (api: TdApi, file: TdFile, priority: number, synchronous: boolean) =>
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
  const local = localUriOf(file) ?? localUriOf(await download(api, file, priority, true));
  if (!local) throw new Error('Telegram could not download that file.');
  return local;
}

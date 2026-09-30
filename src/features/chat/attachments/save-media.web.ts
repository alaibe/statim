import { invoke } from '@tauri-apps/api/core';

import { errorMessage } from '@/core/errors';
import type { AttachedFile } from '@/core/messaging/attachments';
import { toast } from '@/design';
import { pathOfFileUri } from '@/storage/media';

export async function saveMedia(file: AttachedFile): Promise<void> {
  try {
    const saved = await invoke<boolean>('media_export', {
      path: pathOfFileUri(file.uri),
      name: file.name,
    });
    if (saved) toast.success('Saved');
  } catch (error) {
    toast.error(errorMessage(error, 'Could not save'));
  }
}

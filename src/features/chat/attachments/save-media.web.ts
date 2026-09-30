import { invoke } from '@tauri-apps/api/core';

import { errorMessage } from '@/core/errors';
import { toast } from '@/design';
import { pathOfFileUri } from '@/storage/media';

import type { SavableMedia } from './save-media';

export async function saveMedia(media: SavableMedia): Promise<void> {
  try {
    const saved = await invoke<string | null>('media_export', {
      path: pathOfFileUri(media.uri),
      name: media.name,
    });
    if (saved) toast.success('Saved');
  } catch (error) {
    toast.error(errorMessage(error, 'Could not save'));
  }
}

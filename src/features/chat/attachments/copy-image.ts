import * as Clipboard from 'expo-clipboard';

import { readMediaBase64 } from '@/core/messaging/media-store';
import { toast } from '@/design';

export function copyImage(uri: string): Promise<void> {
  return readMediaBase64(uri)
    .then(({ data }) => Clipboard.setImageAsync(data))
    .then(
      () => void toast.success('Copied'),
      () => void toast.error('Could not copy')
    );
}

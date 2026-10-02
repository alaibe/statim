import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { SharePayload } from 'expo-sharing';

import { reportError } from '@/core/app/report-error';
import { basenameOf } from '@/core/messaging/media-store';
import type { MessageContent } from '@/core/messaging/types';

import { assertFits } from './pick';

const MAX_EDGE = 1600;
const QUALITY = 0.78;

/**
 * Another app hands over the original, often a photo of several megabytes,
 * so it is bounded and re-encoded as a JPEG the way the picker would. A GIF
 * stays as it is, since a re-encode would freeze it.
 */
export async function imageFromShare(payload: SharePayload): Promise<MessageContent> {
  const name = basenameOf(payload.value);
  if (payload.mimeType === 'image/gif') {
    const size = new File(payload.value).size ?? undefined;
    assertFits(size, 'That GIF');
    return { kind: 'image', uri: payload.value, name, mimeType: payload.mimeType, size };
  }

  const context = ImageManipulator.manipulate(payload.value);
  const original = await context.renderAsync();
  const scale = Math.min(1, MAX_EDGE / Math.max(original.width, original.height));
  const image =
    scale < 1
      ? await context.resize({ width: Math.round(original.width * scale) }).renderAsync()
      : original;
  const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
  const size = new File(saved.uri).size ?? undefined;
  assertFits(size, 'That photo');

  return {
    kind: 'image',
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    size,
    name: `${(name ?? 'photo').replace(/\.[^.]+$/, '')}.jpg`,
    mimeType: 'image/jpeg',
  };
}

/**
 * The iPhone's share extension leaves a copy of every photo in the app group,
 * and nothing else removes it. Android's content URIs belong to the sender.
 */
export function deleteSharedFiles(payloads: SharePayload[]): void {
  for (const { value } of payloads) {
    if (!value.startsWith('file:')) continue;
    try {
      const file = new File(value);
      if (file.exists) file.delete();
    } catch (error) {
      reportError(error);
    }
  }
}

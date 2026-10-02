import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { SharePayload } from 'expo-sharing';

import { reportError } from '@/core/app/report-error';
import { basenameOf } from '@/core/messaging/media-store';
import type { MessageContent } from '@/core/messaging/types';

import { jpegName, PHOTO_JPEG_QUALITY, photoScale } from './photo-encoding';
import { assertFits } from './pick';

export const isSharedText = (payload: SharePayload) =>
  payload.shareType === 'text' || payload.shareType === 'url';

export function sharedText(payloads: SharePayload[]): string {
  return payloads
    .filter(isSharedText)
    .map((p) => p.value.trim())
    .filter(Boolean)
    .join('\n');
}

export async function contentFromShare(
  payload: SharePayload,
  sendsVideo: boolean
): Promise<MessageContent> {
  const name = basenameOf(payload.value);
  if (payload.shareType === 'image' && payload.mimeType !== 'image/gif') {
    return imageFromShare(payload.value, name);
  }
  const base = {
    uri: payload.value,
    name,
    mimeType: payload.mimeType,
    size: new File(payload.value).size ?? undefined,
  };
  if (payload.shareType === 'image') {
    assertFits(base.size, 'That GIF');
    return { kind: 'image', ...base };
  }
  if (payload.shareType === 'video' && sendsVideo) return { kind: 'video', ...base };
  assertFits(base.size, 'That file');
  return { kind: 'file', ...base, name: name ?? 'file' };
}

async function imageFromShare(uri: string, name: string | undefined): Promise<MessageContent> {
  const context = ImageManipulator.manipulate(uri);
  const original = await context.renderAsync();
  const scale = photoScale(original.width, original.height);
  const image =
    scale < 1
      ? await context.resize({ width: Math.round(original.width * scale) }).renderAsync()
      : original;
  const saved = await image.saveAsync({ compress: PHOTO_JPEG_QUALITY, format: SaveFormat.JPEG });
  const size = new File(saved.uri).size ?? undefined;
  assertFits(size, 'That photo');

  return {
    kind: 'image',
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    size,
    name: jpegName(name),
    mimeType: 'image/jpeg',
  };
}

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

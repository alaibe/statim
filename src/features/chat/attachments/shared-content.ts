import { File } from 'expo-file-system';
import type { SharePayload } from 'expo-sharing';

import { reportError } from '@/core/app/report-error';
import { basenameOf } from '@/core/messaging/media-store';
import type { MessageContent } from '@/core/messaging/types';

import { compressPickedImage } from './compress-image';
import { assertFits, type AttachLimits, imageFrom } from './pick';

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
  can: AttachLimits
): Promise<MessageContent> {
  const name = basenameOf(payload.value);
  if (payload.shareType === 'image' && payload.mimeType !== 'image/gif') {
    const asset = { uri: payload.value, width: 0, height: 0, fileName: name };
    return imageFrom(await compressPickedImage(asset), can.largeFiles);
  }
  const base = {
    uri: payload.value,
    name,
    mimeType: payload.mimeType,
    size: new File(payload.value).size ?? undefined,
  };
  if (payload.shareType === 'image') {
    assertFits(base.size, 'That GIF', can.largeFiles);
    return { kind: 'image', ...base };
  }
  if (payload.shareType === 'video' && can.sendVideo) return { kind: 'video', ...base };
  assertFits(base.size, 'That file', can.largeFiles);
  return { kind: 'file', ...base, name: name ?? 'file' };
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

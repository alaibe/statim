import type { MessageContent } from './types';

export const LOTTIE_STICKER = 'application/x-tgsticker';

export function stickerFormat(mimeType: string | undefined): 'image' | 'lottie' | 'video' {
  if (mimeType === LOTTIE_STICKER) return 'lottie';
  return mimeType?.startsWith('video/') ? 'video' : 'image';
}

export function stickerAsImage(
  sticker: Extract<MessageContent, { kind: 'sticker' }>
): Extract<MessageContent, { kind: 'image' }> {
  if (stickerFormat(sticker.mimeType) !== 'image') {
    throw new Error('This network only takes stickers that are still pictures.');
  }
  const { uri, mimeType, width, height, size } = sticker;
  return { kind: 'image', uri, mimeType, width, height, size };
}

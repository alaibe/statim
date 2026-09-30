export const LOTTIE_STICKER = 'application/x-tgsticker';

export function stickerFormat(mimeType: string | undefined): 'image' | 'lottie' | 'video' {
  if (mimeType === LOTTIE_STICKER) return 'lottie';
  return mimeType?.startsWith('video/') ? 'video' : 'image';
}

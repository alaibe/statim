import type { MessageContent } from './types';

export const LOTTIE_STICKER = 'application/x-tgsticker';

export type StickerContent = Extract<MessageContent, { kind: 'sticker' }>;

export interface StickerPack {
  id: string;
  title: string;
  /** A still picture standing for the pack. */
  cover?: string;
}

export interface StickerChoice {
  id: string;
  emoji?: string;
  /** A still picture of the sticker, for the picker. */
  preview?: string;
}

/** A pack in the picker, whichever source it comes from. */
export interface PickerPack {
  key: string;
  title: string;
  cover?: string;
  stickers(): Promise<StickerChoice[]>;
  content(stickerId: string): Promise<StickerContent>;
}

export function stickerFormat(mimeType: string | undefined): 'image' | 'lottie' | 'video' {
  if (mimeType === LOTTIE_STICKER) return 'lottie';
  return mimeType?.startsWith('video/') ? 'video' : 'image';
}

export function stickerAsImage(
  sticker: StickerContent
): Extract<MessageContent, { kind: 'image' }> {
  if (stickerFormat(sticker.mimeType) !== 'image') {
    throw new Error('This network only takes stickers that are still pictures.');
  }
  const { uri, mimeType, width, height, size } = sticker;
  return { kind: 'image', uri, mimeType, width, height, size };
}

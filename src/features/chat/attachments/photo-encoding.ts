const PHOTO_MAX_EDGE = 1600;
export const PHOTO_JPEG_QUALITY = 0.78;

export const photoScale = (width: number, height: number) =>
  Math.min(1, PHOTO_MAX_EDGE / Math.max(width, height));

export const jpegName = (name: string | null | undefined) =>
  `${(name ?? 'photo').replace(/\.[^.]+$/, '')}.jpg`;

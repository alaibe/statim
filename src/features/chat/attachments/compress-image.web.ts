import type { ImagePickerAsset } from 'expo-image-picker';

import { jpegName, PHOTO_JPEG_QUALITY, photoScale } from './photo-encoding';

/**
 * The browser picker hands over the original file untouched, so a photo is
 * re-encoded here the way the phone's picker does it: bounded in size and as
 * a JPEG, unless it is a GIF, which a re-encode would freeze.
 */
export async function compressPickedImage(asset: ImagePickerAsset): Promise<ImagePickerAsset> {
  if (asset.mimeType === 'image/gif') return asset;

  const image = await load(asset.uri);
  const scale = photoScale(image.naturalWidth, image.naturalHeight);
  const width = Math.round(image.naturalWidth * scale);
  const height = Math.round(image.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY)
  );
  if (!blob) return asset;

  return {
    ...asset,
    uri: URL.createObjectURL(blob),
    width,
    height,
    fileSize: blob.size,
    mimeType: 'image/jpeg',
    fileName: jpegName(asset.fileName),
  };
}

function load(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that image.'));
    image.src = uri;
  });
}

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImagePickerAsset } from 'expo-image-picker';

import { jpegName, PHOTO_JPEG_QUALITY, photoScale } from './photo-encoding';

/** Bounded in size and as a JPEG, unless it is a GIF, which a re-encode would freeze. */
export async function compressPickedImage(asset: ImagePickerAsset): Promise<ImagePickerAsset> {
  if (asset.mimeType === 'image/gif') return asset;

  const context = ImageManipulator.manipulate(asset.uri);
  const original = await context.renderAsync();
  const scale = photoScale(original.width, original.height);
  const image =
    scale < 1
      ? await context.resize({ width: Math.round(original.width * scale) }).renderAsync()
      : original;
  const saved = await image.saveAsync({ compress: PHOTO_JPEG_QUALITY, format: SaveFormat.JPEG });

  return {
    ...asset,
    uri: saved.uri,
    width: saved.width,
    height: saved.height,
    fileSize: new File(saved.uri).size ?? undefined,
    mimeType: 'image/jpeg',
    fileName: jpegName(asset.fileName),
  };
}

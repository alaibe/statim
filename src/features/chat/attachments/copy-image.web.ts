import { toast } from '@/design';

// The write starts inside the click, as WebKit requires, and the picture follows.
// PNG is the one image type webviews put on the clipboard.
export function copyImage(uri: string): Promise<void> {
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': asPng(uri) })]).then(
    () => void toast.success('Copied'),
    () => void toast.error('Could not copy')
  );
}

async function asPng(uri: string): Promise<Blob> {
  const blob = await (await fetch(uri)).blob();
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('No PNG'))), 'image/png')
  );
}

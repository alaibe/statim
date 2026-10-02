import { ImageManipulator } from 'expo-image-manipulator';

import { deleteSharedFiles, imageFromShare } from './shared-image';

const mockSizes: Record<string, number> = {};
const mockDeleted: string[] = [];

jest.mock('expo-file-system', () => ({
  File: class {
    exists = true;
    size: number | null;
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
      this.size = mockSizes[uri] ?? null;
    }
    delete() {
      mockDeleted.push(this.uri);
    }
  },
  Paths: { basename: (uri: string) => uri.split('/').pop() },
}));

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn() },
}));

function photoOf(width: number, height: number) {
  const resize = jest.fn(({ width: w }: { width: number }) => ({
    renderAsync: async () => ({
      width: w,
      height: Math.round((height * w) / width),
      saveAsync: async () => ({
        uri: 'file:///cache/out.jpg',
        width: w,
        height: Math.round((height * w) / width),
      }),
    }),
  }));
  jest.mocked(ImageManipulator.manipulate).mockReturnValue({
    resize,
    renderAsync: async () => ({
      width,
      height,
      saveAsync: async () => ({ uri: 'file:///cache/out.jpg', width, height }),
    }),
  } as never);
  return resize;
}

it('bounds a shared photo to 1600 px and sends it as a JPEG', async () => {
  const resize = photoOf(4032, 3024);
  mockSizes['file:///cache/out.jpg'] = 300 * 1024;

  await expect(
    imageFromShare({
      value: 'file:///group/IMG_0001.HEIC',
      shareType: 'image',
      mimeType: 'image/heic',
    })
  ).resolves.toEqual({
    kind: 'image',
    uri: 'file:///cache/out.jpg',
    width: 1600,
    height: 1200,
    size: 300 * 1024,
    name: 'IMG_0001.jpg',
    mimeType: 'image/jpeg',
  });
  expect(resize).toHaveBeenCalledWith({ width: 1600 });
});

it('leaves a small photo at its size and still refuses one over the limit', async () => {
  const resize = photoOf(800, 600);
  mockSizes['file:///cache/out.jpg'] = 701 * 1024;

  await expect(
    imageFromShare({ value: 'file:///group/small.png', shareType: 'image', mimeType: 'image/png' })
  ).rejects.toThrow('The limit is');
  expect(resize).not.toHaveBeenCalled();
});

it('keeps a GIF as it is, so it still moves', async () => {
  mockSizes['file:///group/party.gif'] = 200 * 1024;

  await expect(
    imageFromShare({ value: 'file:///group/party.gif', shareType: 'image', mimeType: 'image/gif' })
  ).resolves.toEqual({
    kind: 'image',
    uri: 'file:///group/party.gif',
    name: 'party.gif',
    mimeType: 'image/gif',
    size: 200 * 1024,
  });
  expect(ImageManipulator.manipulate).not.toHaveBeenCalledWith('file:///group/party.gif');
});

it("deletes the share extension's copies but never a sender's content URI", () => {
  deleteSharedFiles([
    { value: 'file:///group/IMG_0001.HEIC', shareType: 'image', mimeType: 'image/heic' },
    { value: 'content://media/external/images/1', shareType: 'image', mimeType: 'image/jpeg' },
  ]);
  expect(mockDeleted).toEqual(['file:///group/IMG_0001.HEIC']);
});

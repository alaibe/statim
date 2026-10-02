import { ImageManipulator } from 'expo-image-manipulator';

import { contentFromShare, deleteSharedFiles, sharedText } from './shared-content';

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
    contentFromShare(
      { value: 'file:///group/IMG_0001.HEIC', shareType: 'image', mimeType: 'image/heic' },
      false
    )
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
    contentFromShare(
      { value: 'file:///group/small.png', shareType: 'image', mimeType: 'image/png' },
      false
    )
  ).rejects.toThrow('The limit is');
  expect(resize).not.toHaveBeenCalled();
});

it('keeps a GIF as it is, so it still moves', async () => {
  mockSizes['file:///group/party.gif'] = 200 * 1024;

  await expect(
    contentFromShare(
      { value: 'file:///group/party.gif', shareType: 'image', mimeType: 'image/gif' },
      false
    )
  ).resolves.toEqual({
    kind: 'image',
    uri: 'file:///group/party.gif',
    name: 'party.gif',
    mimeType: 'image/gif',
    size: 200 * 1024,
  });
  expect(ImageManipulator.manipulate).not.toHaveBeenCalledWith('file:///group/party.gif');
});

it('sends a video as a video where the protocol can, and as a file within the limit elsewhere', async () => {
  const clip = {
    value: 'file:///group/clip.mov',
    shareType: 'video',
    mimeType: 'video/quicktime',
  } as const;
  mockSizes[clip.value] = 5 * 1024 * 1024;

  await expect(contentFromShare(clip, true)).resolves.toEqual({
    kind: 'video',
    uri: clip.value,
    name: 'clip.mov',
    mimeType: 'video/quicktime',
    size: 5 * 1024 * 1024,
  });
  await expect(contentFromShare(clip, false)).rejects.toThrow('That file is 5120KB');
});

it('sends anything else as a file', async () => {
  const pdf = {
    value: 'file:///group/notes.pdf',
    shareType: 'file',
    mimeType: 'application/pdf',
  } as const;
  mockSizes[pdf.value] = 40 * 1024;

  await expect(contentFromShare(pdf, true)).resolves.toEqual({
    kind: 'file',
    uri: pdf.value,
    name: 'notes.pdf',
    mimeType: 'application/pdf',
    size: 40 * 1024,
  });
});

it('gathers shared text and links into one draft', () => {
  expect(
    sharedText([
      { value: 'Look at this ', shareType: 'text' },
      { value: 'file:///group/a.jpg', shareType: 'image' },
      { value: 'https://statim.laibe.cc', shareType: 'url' },
    ])
  ).toBe('Look at this\nhttps://statim.laibe.cc');
});

it("deletes the share extension's copies but never a sender's content URI", () => {
  deleteSharedFiles([
    { value: 'file:///group/IMG_0001.HEIC', shareType: 'image', mimeType: 'image/heic' },
    { value: 'content://media/external/images/1', shareType: 'image', mimeType: 'image/jpeg' },
  ]);
  expect(mockDeleted).toEqual(['file:///group/IMG_0001.HEIC']);
});

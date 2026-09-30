import { toMessage } from './mapping';
import type { TdFile, TdMessage } from './types';

const file: TdFile = {
  '@type': 'file',
  id: 1,
  size: 10,
  local: { path: '/td/a', is_downloading_completed: true, is_downloading_active: false },
};

const animation = (mime_type: string): TdMessage => ({
  '@type': 'message',
  id: 5,
  chat_id: 7,
  sender_id: { '@type': 'messageSenderUser', user_id: 9 },
  date: 1,
  is_outgoing: false,
  content: {
    '@type': 'messageAnimation',
    animation: { animation: file, mime_type, width: 320, height: 240 },
    caption: { '@type': 'formattedText', text: '', entities: [] },
  },
});

const context = { media: (f: TdFile) => `file://${f.local.path}`, names: () => '' };

describe('Telegram animations', () => {
  it('plays an MP4 animation as a silent looping video', () => {
    expect(toMessage(animation('video/mp4'), context).content).toEqual({
      kind: 'video',
      uri: 'file:///td/a',
      width: 320,
      height: 240,
      gif: true,
    });
  });

  it('shows a real GIF as an image', () => {
    expect(toMessage(animation('image/gif'), context).content).toMatchObject({
      kind: 'image',
      mimeType: 'image/gif',
    });
  });
});

const sticker = (format: string, downloaded = true): TdMessage => ({
  ...animation('image/webp'),
  content: {
    '@type': 'messageSticker',
    sticker: {
      sticker: { ...file, local: { ...file.local, is_downloading_completed: downloaded } },
      width: 512,
      height: 512,
      emoji: '😂',
      format: { '@type': format },
    },
    is_premium: false,
  },
});

const downloadedOnly = {
  ...context,
  media: (f: TdFile) => (f.local.is_downloading_completed ? `file://${f.local.path}` : null),
};

describe('Telegram stickers', () => {
  it('shows a WEBP sticker', () => {
    expect(toMessage(sticker('stickerFormatWebp'), downloadedOnly).content).toEqual({
      kind: 'sticker',
      uri: 'file:///td/a',
      mimeType: 'image/webp',
      width: 512,
      height: 512,
      size: 10,
      emoji: '😂',
    });
  });

  it('marks an animated sticker as Lottie and a video sticker as WEBM', () => {
    expect(toMessage(sticker('stickerFormatTgs'), downloadedOnly).content).toMatchObject({
      mimeType: 'application/x-tgsticker',
    });
    expect(toMessage(sticker('stickerFormatWebm'), downloadedOnly).content).toMatchObject({
      mimeType: 'video/webm',
    });
  });

  it('waits for the file with the emoji as the label', () => {
    expect(toMessage(sticker('stickerFormatWebp', false), downloadedOnly).content).toEqual({
      kind: 'unsupported',
      typeId: 'sticker',
      fallback: '😂 Sticker',
    });
  });
});

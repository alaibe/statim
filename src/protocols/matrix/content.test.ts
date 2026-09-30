import type { MxEvent } from './api';
import { toContent, type ContentContext } from './content';

const sticker: MxEvent['content'] = {
  kind: 'sticker',
  source: '{"url":"mxc://example.org/abc"}',
  name: 'Cat waving',
  mimeType: 'image/webp',
  size: 20_000,
  width: 256,
  height: 256,
};

const event: MxEvent = {
  id: '$1',
  roomId: '!room:example.org',
  status: 'sent',
  sender: '@a:example.org',
  timestamp: 1,
  isOwn: false,
  content: sticker,
};

const context = (downloaded: boolean): ContentContext => ({
  media: () => (downloaded ? 'file:///matrix/media/abc' : null),
  nameOf: (id) => id,
  learnName: () => {},
  learnPoll: () => {},
});

describe('Matrix stickers', () => {
  it('shows a downloaded m.sticker as a sticker', () => {
    expect(toContent(event, context(true))).toEqual({
      kind: 'sticker',
      uri: 'file:///matrix/media/abc',
      mimeType: 'image/webp',
      width: 256,
      height: 256,
      size: 20_000,
    });
  });

  it('waits for the file under the sticker’s own text', () => {
    expect(toContent(event, context(false))).toEqual({
      kind: 'unsupported',
      typeId: 'sticker',
      fallback: 'Cat waving',
    });
  });
});

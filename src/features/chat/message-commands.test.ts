import type { ChatMessage } from '@/core/messaging/types';

import { copyImage } from './attachments/copy-image';
import { saveMedia } from './attachments/save-media';
import { messageActions } from './message-commands';
import { asChatId } from '@/core/messaging/testing/ids';

jest.mock('./attachments/save-media', () => ({ saveMedia: jest.fn(async () => {}) }));
jest.mock('./attachments/copy-image', () => ({ copyImage: jest.fn(async () => {}) }));

const handlers = {
  reply: jest.fn(),
  openThread: jest.fn(),
  forward: jest.fn(),
  edit: jest.fn(),
  remove: jest.fn(),
  retry: jest.fn(),
  togglePin: jest.fn(),
};
const all = {
  send: true,
  reply: true,
  edit: true,
  delete: true,
  deleteForMe: true,
  deleteOthers: false,
  pin: true,
  thread: false,
};
const none = {
  send: false,
  reply: false,
  edit: false,
  delete: false,
  deleteForMe: false,
  deleteOthers: false,
  pin: false,
  thread: false,
};

const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  chatId: asChatId('xmtp-c1'),
  senderId: 'me',
  sentAt: 1,
  content: { kind: 'text', text: 'hello' },
  fromMe: true,
  status: 'sent',
  ...over,
});

const ids = (m: ChatMessage, can = all) => messageActions(m, handlers, can).map((a) => a.id);

describe('messageActions', () => {
  it('offers everything for my own sent text where the protocol can do it', () => {
    expect(ids(message())).toEqual([
      'reply',
      'copy',
      'forward',
      'edit',
      'pin',
      'delete-for-me',
      'delete',
    ]);
  });

  it('leaves out what the protocol cannot do', () => {
    expect(ids(message(), none)).toEqual(['copy', 'forward']);
  });

  it('never edits someone else’s message, and deletes it for everyone only with the right', () => {
    expect(ids(message({ fromMe: false }))).toEqual([
      'reply',
      'copy',
      'forward',
      'pin',
      'delete-for-me',
    ]);
    expect(ids(message({ fromMe: false }), { ...all, deleteOthers: true })).toContain('delete');
  });

  it('offers a thread where the protocol has them, once the message has arrived', () => {
    expect(ids(message(), { ...all, thread: true })).toEqual([
      'reply',
      'thread',
      'copy',
      'forward',
      'edit',
      'pin',
      'delete-for-me',
      'delete',
    ]);
    expect(ids(message({ status: 'sending' }), { ...all, thread: true })).not.toContain('thread');
  });

  it('hides replying where the chat takes no reply', () => {
    expect(ids(message(), { ...all, reply: false })).not.toContain('reply');
  });

  it('hides pinning where the chat does not allow it', () => {
    expect(ids(message(), { ...all, pin: false })).not.toContain('pin');
  });

  it('offers a retry for a failed send, and nothing that needs it to have arrived', () => {
    expect(ids(message({ status: 'failed' }))).toEqual(['retry', 'reply', 'copy', 'forward']);
    expect(ids(message({ status: 'failed' }), { ...all, send: false })).not.toContain('retry');
  });

  it('saves a photo, video or file once it has arrived', () => {
    const photo = { kind: 'image', uri: 'asset://localhost/a.jpg' } as const;
    expect(ids(message({ content: photo }))).toEqual([
      'reply',
      'copy-image',
      'save',
      'forward',
      'pin',
      'delete-for-me',
      'delete',
    ]);
    expect(ids(message({ content: photo, status: 'sending' }))).not.toContain('save');

    messageActions(message({ content: photo }), handlers, all)
      .find((a) => a.id === 'save')
      ?.onPress();
    expect(saveMedia).toHaveBeenCalledWith(photo);
  });

  it('copies a photo once it has arrived, and only a photo', () => {
    const photo = { kind: 'image', uri: 'asset://localhost/a.jpg' } as const;
    const video = { kind: 'video', uri: 'asset://localhost/a.mp4' } as const;
    expect(ids(message({ content: photo, status: 'sending' }))).not.toContain('copy-image');
    expect(ids(message({ content: video }))).not.toContain('copy-image');

    messageActions(message({ content: photo }), handlers, all)
      .find((a) => a.id === 'copy-image')
      ?.onPress();
    expect(copyImage).toHaveBeenCalledWith(photo.uri);
  });

  it('hands the message to the flow it starts', () => {
    const m = message();
    messageActions(m, handlers, all)
      .find((a) => a.id === 'edit')
      ?.onPress();
    expect(handlers.edit).toHaveBeenCalledWith(m);
  });
});

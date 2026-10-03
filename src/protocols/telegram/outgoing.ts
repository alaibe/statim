import type { MessageContent } from '@/core/messaging/types';
import { pathOfFileUri } from '@/storage/media';

import type { TdObject } from './api';
import { markdownToFormatted } from './formatting';

export function inputContent(content: MessageContent): TdObject {
  const caption =
    'caption' in content && content.caption ? markdownToFormatted(content.caption) : null;

  switch (content.kind) {
    case 'text':
      return { '@type': 'inputMessageText', text: markdownToFormatted(content.text) };
    case 'image':
      if (content.mimeType === 'image/gif') {
        return {
          '@type': 'inputMessageAnimation',
          animation: {
            '@type': 'inputAnimation',
            animation: localFile(content.uri),
            thumbnail: null,
            added_sticker_file_ids: [],
            duration: 0,
            width: content.width ?? 0,
            height: content.height ?? 0,
          },
          caption,
          show_caption_above_media: false,
          has_spoiler: false,
        };
      }
      return {
        '@type': 'inputMessagePhoto',
        photo: {
          '@type': 'inputPhoto',
          photo: localFile(content.uri),
          thumbnail: null,
          video: null,
          added_sticker_file_ids: [],
          width: content.width ?? 0,
          height: content.height ?? 0,
        },
        caption,
        show_caption_above_media: false,
        self_destruct_type: null,
        has_spoiler: false,
      };
    case 'file':
      return {
        '@type': 'inputMessageDocument',
        document: {
          '@type': 'inputDocument',
          document: localFile(content.uri),
          thumbnail: null,
          disable_content_type_detection: false,
        },
        caption: null,
      };
    case 'voice':
      return {
        '@type': 'inputMessageVoiceNote',
        voice_note: {
          '@type': 'inputVoiceNote',
          voice_note: localFile(content.uri),
          duration: Math.round(content.durationMs / 1000),
          waveform: '',
        },
        caption: null,
        self_destruct_type: null,
      };
    case 'video':
      return {
        '@type': 'inputMessageVideo',
        video: {
          '@type': 'inputVideo',
          video: localFile(content.uri),
          thumbnail: null,
          cover: null,
          start_timestamp: 0,
          added_sticker_file_ids: [],
          duration: Math.round((content.durationMs ?? 0) / 1000),
          width: content.width ?? 0,
          height: content.height ?? 0,
          supports_streaming: true,
        },
        caption,
        show_caption_above_media: false,
        self_destruct_type: null,
        has_spoiler: false,
      };
    case 'sticker':
      return {
        '@type': 'inputMessageSticker',
        sticker: {
          '@type': 'inputSticker',
          sticker: localFile(content.uri),
          thumbnail: null,
          width: content.width ?? 0,
          height: content.height ?? 0,
        },
        emoji: content.emoji ?? '',
      };
    default:
      throw new Error(`Telegram cannot send "${content.kind}" content`);
  }
}

function localFile(uri: string): TdObject {
  return { '@type': 'inputFileLocal', path: pathOfFileUri(uri) };
}

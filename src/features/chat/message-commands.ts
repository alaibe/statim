import { copyText } from '@/design';
import { plainText } from '@/core/messaging/markdown';
import type { ChatPermissions } from '@/core/messaging/permissions';
import type { ChatMessage } from '@/core/messaging/types';

import { copyImage } from './attachments/copy-image';
import { saveMedia } from './attachments/save-media';
import type { MessageAction } from './message-actions';

export interface ChatActions {
  reply(message: ChatMessage): void;
  openThread(message: ChatMessage): void;
  forward(message: ChatMessage): void;
  edit(message: ChatMessage): void;
  remove(message: ChatMessage, forEveryone: boolean): void;
  retry(message: ChatMessage): void;
  togglePin(message: ChatMessage): void;
}

/** `thread` is false inside a thread, where replies already stay in it. */
export type ActionSupport = Pick<
  ChatPermissions,
  'send' | 'edit' | 'delete' | 'deleteForMe' | 'deleteOthers' | 'pin' | 'thread'
>;

export function messageActions(
  message: ChatMessage,
  actions: ChatActions,
  can: ActionSupport
): MessageAction[] {
  const { content } = message;
  const sent = message.status === 'sent';
  const mine = message.fromMe && sent;
  const copy = copyableText(content);
  const save = mediaSaver(message);
  const menu: (MessageAction | false)[] = [
    can.send &&
      message.status === 'failed' && {
        id: 'retry',
        label: 'Try again',
        icon: 'refresh-outline',
        onPress: () => actions.retry(message),
      },
    !message.privateToMe && {
      id: 'reply',
      label: 'Reply',
      icon: 'arrow-undo-outline',
      onPress: () => actions.reply(message),
    },
    can.thread &&
      sent &&
      !message.privateToMe && {
        id: 'thread',
        label: 'Reply in thread',
        icon: 'chatbubbles-outline',
        onPress: () => actions.openThread(message),
      },
    sent &&
      content.kind === 'image' && {
        id: 'copy-image',
        label: 'Copy image',
        icon: 'images-outline',
        onPress: () => void copyImage(content.uri),
      },
    !!copy && {
      id: 'copy',
      label: 'Copy',
      icon: 'copy-outline',
      onPress: () => void copyText(copy),
    },
    !!save && {
      id: 'save',
      label: 'Save as…',
      icon: 'download-outline',
      onPress: save,
    },
    {
      id: 'forward',
      label: 'Forward',
      icon: 'arrow-redo-outline',
      onPress: () => actions.forward(message),
    },
    can.edit &&
      mine &&
      content.kind === 'text' && {
        id: 'edit',
        label: 'Edit',
        icon: 'create-outline',
        onPress: () => actions.edit(message),
      },
    can.pin &&
      sent && {
        id: 'pin',
        label: message.isPinned ? 'Unpin message' : 'Pin message',
        icon: 'pin-outline',
        onPress: () => actions.togglePin(message),
      },
    can.deleteForMe &&
      sent && {
        id: 'delete-for-me',
        label: 'Delete for me',
        icon: 'trash-outline',
        tone: 'danger',
        onPress: () => actions.remove(message, false),
      },
    sent &&
      (message.fromMe ? can.delete : can.deleteOthers) && {
        id: 'delete',
        label: 'Delete for everyone',
        icon: 'trash-outline',
        tone: 'danger',
        onPress: () => actions.remove(message, true),
      },
  ];
  return menu.filter((action): action is MessageAction => action !== false);
}

function copyableText(content: ChatMessage['content']): string | undefined {
  switch (content.kind) {
    case 'text':
      return plainText(content.text);
    case 'system':
      return content.text;
    case 'image':
    case 'video':
      return content.caption || undefined;
    case 'file':
      return content.name;
    case 'custom':
    case 'widget':
      return content.fallback || undefined;
    default:
      return undefined;
  }
}

/** Undefined on phones, for other kinds of message, and until the file has arrived. */
export function mediaSaver(message: ChatMessage): (() => void) | undefined {
  // An imported binding is not narrowed inside the closure below.
  const save = saveMedia;
  const { content } = message;
  if (!save || message.status !== 'sent') return undefined;
  if (content.kind !== 'image' && content.kind !== 'video' && content.kind !== 'file') {
    return undefined;
  }
  return () => void save(content);
}

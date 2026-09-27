import { supports } from './capability';
import type { ChatSession } from './protocol';
import type { Chat } from './types';

export interface ChatPermissions {
  send: boolean;
  edit: boolean;
  /** Delete your own messages for everyone. */
  delete: boolean;
  deleteForMe: boolean;
  /** Delete other participants' messages for everyone. */
  deleteOthers: boolean;
  pin: boolean;
  answerRequest: boolean;
  addMembers: boolean;
  removeMembers: boolean;
  invite: boolean;
}

export const NO_PERMISSIONS: Readonly<ChatPermissions> = Object.freeze({
  send: false,
  edit: false,
  delete: false,
  deleteForMe: false,
  deleteOthers: false,
  pin: false,
  answerRequest: false,
  addMembers: false,
  removeMembers: false,
  invite: false,
});

export function chatPermissions(chat: Chat, session: ChatSession | undefined): ChatPermissions {
  const manages = chat.selfRole === 'owner' || chat.selfRole === 'admin';
  const managesGroup = chat.kind === 'group' && manages;
  const deletes = supports(session, 'deleteMessage');
  return {
    send: chat.canSend ?? chat.kind !== 'channel',
    edit: supports(session, 'editMessage'),
    delete: deletes,
    deleteForMe: supports(session, 'deleteMessageForMe'),
    deleteOthers: deletes && chat.canDeleteOthers === true,
    pin: supports(session, 'setMessagePinned') && chat.canPin !== false,
    answerRequest: chat.consent === 'request' && supports(session, 'setConsent'),
    addMembers: managesGroup,
    removeMembers: managesGroup,
    invite: manages && supports(session, 'createInviteLink'),
  };
}

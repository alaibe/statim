import { isLocalChat, takesAttachments } from './bots';
import { supports } from './capability';
import type { ChatSession } from './protocol';
import type { Chat, ChatFeature } from './types';

export interface ChatPermissions {
  send: boolean;
  reply: boolean;
  attach: boolean;
  /** Pictures go out as pictures; without, only as files. */
  sendImages: boolean;
  sendVideo: boolean;
  announceTyping: boolean;
  mention: boolean;
  /** Pick from your sticker packs on the network. */
  networkStickers: boolean;
  edit: boolean;
  /** Delete your own messages for everyone. */
  delete: boolean;
  deleteForMe: boolean;
  /** Delete other participants' messages for everyone. */
  deleteOthers: boolean;
  pin: boolean;
  seePins: boolean;
  react: boolean;
  vote: boolean;
  thread: boolean;
  answerRequest: boolean;
  /** Block the other participant of a DM. */
  block: boolean;
  seeGroupInfo: boolean;
  addMembers: boolean;
  removeMembers: boolean;
  ban: boolean;
  muteMembers: boolean;
  invite: boolean;
  answerJoinRequests: boolean;
}

export const NO_PERMISSIONS: Readonly<ChatPermissions> = Object.freeze({
  send: false,
  reply: false,
  attach: false,
  sendImages: false,
  sendVideo: false,
  announceTyping: false,
  mention: false,
  networkStickers: false,
  edit: false,
  delete: false,
  deleteForMe: false,
  deleteOthers: false,
  pin: false,
  seePins: false,
  react: false,
  vote: false,
  thread: false,
  answerRequest: false,
  block: false,
  seeGroupInfo: false,
  addMembers: false,
  removeMembers: false,
  ban: false,
  muteMembers: false,
  invite: false,
  answerJoinRequests: false,
});

export function chatPermissions(chat: Chat, session: ChatSession | undefined): ChatPermissions {
  const manages = chat.selfRole === 'owner' || chat.selfRole === 'admin';
  const managesGroup = chat.kind === 'group' && manages;
  const has = (feature: ChatFeature) => !chat.lacks?.includes(feature);
  const deletes = supports(session, 'deleteMessage') && has('delete');
  const attach = takesAttachments(chat.id);
  const send = !chat.blocked && (chat.canSend ?? chat.kind !== 'channel');
  return {
    send,
    reply: send && has('reply'),
    attach,
    // The app's own chats keep what you send on this device, pictures included.
    sendImages: attach && (isLocalChat(chat.id) || Boolean(session?.sendsImages)) && has('images'),
    sendVideo: Boolean(session?.sendsVideo) && has('video'),
    announceTyping: supports(session, 'setTyping'),
    mention: chat.kind === 'group' && supports(session, 'mentionCandidates'),
    networkStickers: supports(session, 'stickerPacks'),
    edit: supports(session, 'editMessage') && has('edit'),
    delete: deletes,
    deleteForMe: supports(session, 'deleteMessageForMe'),
    deleteOthers: deletes && chat.canDeleteOthers === true,
    pin: supports(session, 'setMessagePinned') && chat.canPin !== false && has('pin'),
    seePins: supports(session, 'listPinnedMessages'),
    react: !chat.blocked && has('react'),
    vote: !chat.blocked && supports(session, 'votePoll') && has('poll'),
    thread: Boolean(session?.threads) && has('thread'),
    answerRequest: chat.consent === 'request' && !chat.blocked && supports(session, 'setConsent'),
    block: chat.kind === 'dm' && supports(session, 'setBlocked'),
    seeGroupInfo: chat.kind !== 'dm' && supports(session, 'getGroupInfo'),
    addMembers: managesGroup && has('invite'),
    removeMembers: managesGroup && has('remove'),
    ban: managesGroup && supports(session, 'banMember') && has('ban'),
    muteMembers: managesGroup && supports(session, 'setMemberMuted'),
    invite: manages && supports(session, 'createInviteLink'),
    answerJoinRequests: manages && supports(session, 'getJoinRequests'),
  };
}

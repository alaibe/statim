/**
 * The slice of TDLib's JSON API this adapter reads. Field names follow TDLib
 * (https://core.telegram.org/tdlib/docs/td__api_8h.html), so they are
 * snake_case on purpose.
 */
import type { TdObject } from './api';

export interface TdUser extends TdObject {
  '@type': 'user';
  id: number;
  first_name: string;
  last_name: string;
  usernames?: { active_usernames: string[] };
  phone_number: string;
  status: TdUserStatus;
  type: { '@type': 'userTypeRegular' | 'userTypeBot' | 'userTypeDeleted' | 'userTypeUnknown' };
}

export type TdUserStatus =
  | { '@type': 'userStatusOffline'; was_online: number }
  | {
      '@type':
        | 'userStatusEmpty'
        | 'userStatusOnline'
        | 'userStatusRecently'
        | 'userStatusLastWeek'
        | 'userStatusLastMonth';
    };

export type TdChatType =
  | { '@type': 'chatTypePrivate'; user_id: number }
  | { '@type': 'chatTypeBasicGroup'; basic_group_id: number }
  | { '@type': 'chatTypeSupergroup'; supergroup_id: number; is_channel: boolean }
  | { '@type': 'chatTypeSecret'; secret_chat_id: number; user_id: number };

export interface TdChatPosition {
  list: { '@type': 'chatListMain' | 'chatListArchive' | 'chatListFolder' };
  order: string;
}

export interface TdDraftMessage {
  content: { '@type': string; text?: TdFormattedText };
}

/** Main stops their messages and calls; Stories only hides your stories from them. */
export type TdBlockList = { '@type': 'blockListMain' | 'blockListStories' };

export interface TdChat extends TdObject {
  '@type': 'chat';
  id: number;
  type: TdChatType;
  title: string;
  photo?: { small: TdFile; big: TdFile } | null;
  positions: TdChatPosition[];
  last_message?: TdMessage;
  unread_count?: number;
  unread_mention_count?: number;
  is_marked_as_unread?: boolean;
  draft_message?: TdDraftMessage | null;
  pending_join_requests?: { total_count: number } | null;
  permissions?: TdPermissions;
  last_read_outbox_message_id: number;
  block_list?: TdBlockList | null;
}

export type TdMemberStatus =
  | 'chatMemberStatusCreator'
  | 'chatMemberStatusAdministrator'
  | 'chatMemberStatusMember'
  | 'chatMemberStatusRestricted'
  | 'chatMemberStatusLeft'
  | 'chatMemberStatusBanned';

export interface TdPermissions {
  can_send_basic_messages: boolean;
  can_pin_messages?: boolean;
}

export interface TdStatus {
  '@type': TdMemberStatus;
  permissions?: TdPermissions;
  rights?: {
    can_restrict_members?: boolean;
    can_post_messages?: boolean;
    can_edit_messages?: boolean;
    can_delete_messages?: boolean;
    can_pin_messages?: boolean;
  };
}

export interface TdBasicGroup extends TdObject {
  '@type': 'basicGroup';
  id: number;
  member_count: number;
  status: TdStatus;
}

export interface TdSupergroup extends TdObject {
  '@type': 'supergroup';
  id: number;
  member_count: number;
  usernames?: { active_usernames: string[] } | null;
  join_by_request?: boolean;
  status: TdStatus;
  is_channel: boolean;
}

export interface TdChatMember {
  member_id: TdSender;
  status: TdStatus;
}

export type TdSender =
  | { '@type': 'messageSenderUser'; user_id: number }
  | { '@type': 'messageSenderChat'; chat_id: number };

export interface TdFile extends TdObject {
  '@type': 'file';
  id: number;
  size: number;
  local: { path: string; is_downloading_completed: boolean; is_downloading_active: boolean };
}

export interface TdSticker {
  id: string;
  width: number;
  height: number;
  emoji?: string;
  format: { '@type': string };
  /** WEBP or JPEG, whatever the sticker's own format. */
  thumbnail: { file: TdFile } | null;
  sticker: TdFile;
}

export interface TdFormattedText extends TdObject {
  '@type': 'formattedText';
  text: string;
  entities: TdObject[];
}

export interface TdMessage extends TdObject {
  '@type': 'message';
  id: number;
  chat_id: number;
  sender_id: TdSender;
  date: number;
  is_outgoing: boolean;
  is_pinned?: boolean;
  edit_date?: number;
  sending_state?: TdObject | null;
  reply_to?:
    | { '@type': 'messageReplyToMessage'; chat_id: number; message_id: number }
    | TdObject
    | null;
  forward_info?: TdObject | null;
  interaction_info?: {
    reactions?: { reactions: TdReaction[] } | null;
  } | null;
  content: TdObject;
}

export interface TdReaction {
  type: { '@type': 'reactionTypeEmoji'; emoji: string } | { '@type': string };
  total_count: number;
  is_chosen: boolean;
  recent_sender_ids: TdSender[];
}

export type TdCodeType =
  | 'authenticationCodeTypeTelegramMessage'
  | 'authenticationCodeTypeSms'
  | 'authenticationCodeTypeSmsWord'
  | 'authenticationCodeTypeSmsPhrase'
  | 'authenticationCodeTypeCall'
  | 'authenticationCodeTypeFlashCall'
  | 'authenticationCodeTypeMissedCall'
  | 'authenticationCodeTypeFragment'
  | 'authenticationCodeTypeFirebaseAndroid'
  | 'authenticationCodeTypeFirebaseIos';

export type TdAuthorizationState =
  | {
      '@type': 'authorizationStateWaitCode';
      code_info: { type: { '@type': TdCodeType } };
    }
  | { '@type': 'authorizationStateWaitPassword'; password_hint?: string }
  | {
      '@type':
        | 'authorizationStateWaitTdlibParameters'
        | 'authorizationStateWaitPhoneNumber'
        | 'authorizationStateWaitPremiumPurchase'
        | 'authorizationStateWaitEmailAddress'
        | 'authorizationStateWaitEmailCode'
        | 'authorizationStateWaitOtherDeviceConfirmation'
        | 'authorizationStateWaitRegistration'
        | 'authorizationStateReady'
        | 'authorizationStateLoggingOut'
        | 'authorizationStateClosing'
        | 'authorizationStateClosed';
    };

export type TdChatUpdate =
  | { '@type': 'updateChatPosition'; chat_id: number; position: TdChatPosition }
  | { '@type': 'updateChatTitle'; chat_id: number; title: string }
  | { '@type': 'updateChatPhoto'; chat_id: number; photo: TdChat['photo'] }
  | {
      '@type': 'updateChatLastMessage';
      chat_id: number;
      last_message: TdMessage | null;
      positions: TdChatPosition[];
    }
  | { '@type': 'updateChatReadInbox'; chat_id: number; unread_count: number }
  | { '@type': 'updateChatReadOutbox'; chat_id: number; last_read_outbox_message_id: number }
  | { '@type': 'updateChatUnreadMentionCount'; chat_id: number; unread_mention_count: number }
  | {
      '@type': 'updateChatPendingJoinRequests';
      chat_id: number;
      pending_join_requests: TdChat['pending_join_requests'];
    }
  | {
      '@type': 'updateChatDraftMessage';
      chat_id: number;
      draft_message: TdChat['draft_message'];
      positions: TdChatPosition[];
    }
  | { '@type': 'updateChatIsMarkedAsUnread'; chat_id: number; is_marked_as_unread: boolean }
  | { '@type': 'updateChatPermissions'; chat_id: number; permissions: TdChat['permissions'] }
  | { '@type': 'updateChatBlockList'; chat_id: number; block_list: TdBlockList | null };

export type TdUpdate =
  | TdChatUpdate
  | { '@type': 'updateAuthorizationState'; authorization_state: TdAuthorizationState }
  | { '@type': 'updateUser'; user: TdUser }
  | { '@type': 'updateUserStatus'; user_id: number; status: TdUserStatus }
  | {
      '@type': 'updateChatAction';
      chat_id: number;
      sender_id: TdSender;
      action: { '@type': string };
    }
  | { '@type': 'updateBasicGroup'; basic_group: TdBasicGroup }
  | { '@type': 'updateSupergroup'; supergroup: TdSupergroup }
  | { '@type': 'updateNewChat'; chat: TdChat }
  | { '@type': 'updateBasicGroupFullInfo'; basic_group_id: number }
  | { '@type': 'updateSupergroupFullInfo'; supergroup_id: number }
  | { '@type': 'updateNewMessage'; message: TdMessage }
  | { '@type': 'updateMessageSendSucceeded'; message: TdMessage; old_message_id: number }
  | {
      '@type': 'updateMessageSendFailed';
      old_message_id: number;
      error: { message: string };
    }
  | {
      '@type':
        | 'updateMessageContent'
        | 'updateMessageEdited'
        | 'updateMessageInteractionInfo'
        | 'updateMessageIsPinned';
      chat_id: number;
      message_id: number;
    }
  | {
      '@type': 'updateDeleteMessages';
      chat_id: number;
      message_ids: number[];
      is_permanent: boolean;
      from_cache: boolean;
    }
  | { '@type': 'updateFile'; file: TdFile };

export interface TdMessages extends TdObject {
  '@type': 'messages';
  total_count: number;
  messages: (TdMessage | null)[];
}

export interface TdChats extends TdObject {
  '@type': 'chats';
  chat_ids: number[];
}

export interface TdChatMembers extends TdObject {
  '@type': 'chatMembers';
  members: TdChatMember[];
}

export interface TdBasicGroupFullInfo extends TdObject {
  '@type': 'basicGroupFullInfo';
  members: TdChatMember[];
  description?: string;
  invite_link?: { invite_link: string } | null;
}

import type { AccountRuntime } from '@/core/app/account-runtime';
import type { AppearanceState } from '@/core/app/appearance';
import type { AccountState } from '@/core/account/account-store';
import type { LockState } from '@/core/account/lock-store';
import type { ChatState } from '@/core/messaging/chat-store';
import type { XmtpCapabilities } from '@/core/messaging/protocol';
import type { PluginHostValue } from '@/core/plugins/host';

import type { CommandPath } from './commands';

type Actions<S> = {
  [K in keyof S]-?: NonNullable<S[K]> extends (...args: never[]) => unknown ? K : never;
}[keyof S];

/**
 * Where each thing the app can do lives on the command line. A new store
 * action fails typecheck until it is given a command here, or a reason why it
 * has none: `internal` for plumbing no one triggers, `app:` for what needs the
 * window or a device in hand.
 */
type Covered = CommandPath | 'internal' | `app: ${string}`;

export const CHAT_STORE: Record<Actions<ChatState>, Covered> = {
  registerBots: 'internal',
  postLocalMessage: 'internal',
  postPrivateMessage: 'internal',
  refreshChats: 'protocols sync',
  loadMessages: 'read',
  loadOlderMessages: 'read',
  searchMessages: 'search',
  sendMessage: 'send',
  resolveParticipant: 'resolve',
  startDm: 'new',
  startGroup: 'group create',
  previewPublicChat: 'join',
  joinPublicChat: 'join',
  createInviteLink: 'group invite-link',
  getJoinRequests: 'group requests',
  processJoinRequest: 'group approve',
  sync: 'protocols sync',
  syncProtocol: 'protocols sync',
  getMembers: 'group members',
  mentionCandidates: 'internal',
  stickerPacks: 'app: the sticker picker',
  stickers: 'app: the sticker picker',
  stickerContent: 'app: the sticker picker',
  getGroupInfo: 'chat',
  setSlowModeDelay: 'group slowmode',
  addMembers: 'group add',
  removeMembers: 'group remove',
  banMember: 'group ban',
  setMemberMuted: 'group mute',
  renameGroup: 'group rename',
  leaveGroup: 'group leave',
  react: 'react',
  markRead: 'mark-read',
  fetchMedia: 'download',
  setTyping: 'internal',
  watchPresence: 'chat',
  markUnread: 'mark-unread',
  setConsent: 'accept',
  setBlocked: 'block',
  setChatPref: 'pin',
  setDraft: 'draft',
  ingestMessage: 'internal',
  ingestChat: 'internal',
  ingestChats: 'internal',
  replacePending: 'internal',
  retryMessage: 'retry',
  editMessage: 'edit',
  deleteMessage: 'delete',
  votePoll: 'poll vote',
  createPoll: 'poll create',
  listPinnedMessages: 'pins',
  setMessagePinned: 'pin-message',
  removeMessages: 'internal',
};

export const ACCOUNT_STORE: Record<Actions<AccountState>, Covered> = {
  restore: 'internal',
  retryUnlock: 'app: the lock screen asks the system to unlock the keys',
  adoptAccount: 'accounts import',
  addHardwareAccount: 'app: pairing needs the hardware wallet and its screen',
  selectAccount: 'accounts use',
  renameAccount: 'accounts rename',
  removeErasedAccount: 'accounts erase',
};

const APP_ONLY_LOCK =
  'app: the lock is set up only in the app, so nothing on the command line can change or remove it';

export const LOCK_STORE: Record<Actions<LockState>, Covered> = {
  evaluate: 'internal',
  noteJustAuthenticated: 'internal',
  unlock: 'app: the lock screen asks for Face ID or the PIN on the device',
  verifyPin: 'app: the PIN is typed into the app, never passed over the command line',
  setPin: APP_ONLY_LOCK,
  removePin: APP_ONLY_LOCK,
  setBiometricLock: APP_ONLY_LOCK,
};

export const APPEARANCE_STORE: Record<Actions<AppearanceState>, Covered> = {
  hydrate: 'internal',
  clear: 'internal',
  setTheme: 'settings set',
  setWallpaper: 'settings set',
  setReadReceipts: 'settings set',
  setTypingIndicators: 'settings set',
  setLinkPreviews: 'settings set',
  setAiInChats: 'settings set',
};

export const ACCOUNT_RUNTIME: Record<Actions<AccountRuntime>, Covered> = {
  synchronize: 'internal',
  disconnect: 'internal',
  setPluginEnabled: 'plugins enable',
  updateProtocolConfig: 'protocols config',
  erase: 'accounts erase',
  wasProactive: 'internal',
};

export const XMTP: Record<Actions<XmtpCapabilities>, Covered> = {
  eraseLocalDatabase: 'internal',
  listInstallations: 'devices',
  revokeInstallations: 'devices revoke',
};

export const PLUGIN_HOST: Record<Actions<PluginHostValue>, Covered> = {
  makeContext: 'internal',
  onPluginsChanged: 'internal',
  setEnabled: 'plugins enable',
  handleUri: 'link',
};

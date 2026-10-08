import { orderChats, prefsFor, type ChatPrefs } from '@/core/messaging/chat-prefs';
import { sessionFor, useChatStore } from '@/core/messaging/chat-store';
import { draftKey } from '@/core/messaging/drafts';
import { matchesFilter, networkOf, splitRequests, type ChatFilter } from '@/core/messaging/folders';
import { chatPermissions } from '@/core/messaging/permissions';
import { messagePreview } from '@/core/messaging/preview';
import { showsInPreview } from '@/core/messaging/message-rules';
import { LOCAL_PROTOCOL } from '@/core/messaging/namespace';
import { NETWORK_IDS, type NetworkId } from '@/core/messaging/networks';
import type { Chat, ChatId } from '@/core/messaging/types';
import { MARKED_UNREAD, unreadBadge } from '@/core/messaging/unread';

import {
  chatLabels,
  displayNames,
  findChat,
  findMessage,
  loadedMessages,
  messageJson,
  messageLine,
  readyChat,
  whenAccountReady,
  type ChatLabel,
  type CliHandler,
} from '../context';
import { networkLabel } from '@/features/protocols/presentation';

import { CliError } from '../errors';
import type { ParsedArgs } from '../args';

function draftOf(chat: Chat): string | undefined {
  return useChatStore.getState().drafts[draftKey(chat.id)] ?? chat.draft;
}

const networkIn = (chat: Chat): NetworkId => networkOf(chat) ?? LOCAL_PROTOCOL;

function chatJson(c: Chat, label: ChatLabel = { title: c.title }) {
  const state = useChatStore.getState();
  const { chatPrefs, readAt } = state;
  const prefs = prefsFor(chatPrefs, c.id);
  const draft = draftOf(c);
  return {
    id: c.id,
    title: label.title,
    ...(label.participant ? { participant: label.participant, address: label.address } : {}),
    kind: c.kind,
    network: networkIn(c),
    unread: unreadBadge(c, readAt[c.id] ?? 0),
    markedUnread: readAt[c.id] === MARKED_UNREAD || Boolean(c.markedUnread),
    mentions: c.mentionCount ?? 0,
    lastMessage: c.lastMessage ? messagePreview(c.lastMessage) : undefined,
    lastAt: c.lastMessage ? new Date(c.lastMessage.sentAt).toISOString() : undefined,
    request: c.consent === 'request',
    declined: c.consent === 'declined',
    pinned: Boolean(prefs.pinned),
    muted: Boolean(prefs.muted),
    archived: Boolean(prefs.archived),
    blocked: Boolean(c.blocked),
    canSend: chatPermissions(c, sessionFor(state, c.id)).send,
    ...(draft ? { draft } : {}),
  };
}

function chatLine(c: ReturnType<typeof chatJson>): string {
  const marks = [
    c.unread ? `${c.unread} unread` : c.markedUnread ? 'unread' : '',
    c.pinned ? 'pinned' : '',
    c.muted ? 'muted' : '',
    c.blocked ? 'blocked' : '',
  ].filter(Boolean);
  return (
    `${c.title}  (${c.network} ${c.kind}${marks.length ? `, ${marks.join(', ')}` : ''})  ${c.id}` +
    (c.lastMessage ? `\n    ${c.lastMessage.slice(0, 100)}` : '')
  );
}

function onChat(change: (id: ChatId) => Promise<void>, data: object, done: string): CliHandler {
  return async ({ args }) => {
    const chat = await readyChat(args.chat!);
    await change(chat.id);
    return { data: { id: chat.id, ...data }, text: `${done} ${chat.label}.` };
  };
}

const setPref = (change: Partial<ChatPrefs>, done: string) =>
  onChat((id) => useChatStore.getState().setChatPref(id, change), change, done);

const setBlocked = (blocked: boolean, done: string) =>
  onChat((id) => useChatStore.getState().setBlocked(id, blocked), { blocked }, done);

async function readChat({ args, flags }: ParsedArgs) {
  const chat = await readyChat(args.chat!);
  const count = Number(flags.limit ?? 20);
  if (!Number.isInteger(count) || count <= 0)
    throw new CliError('--limit takes a positive number.', 'usage');

  await loadedMessages(chat.id);
  const cutoff =
    typeof flags.before === 'string' ? await findMessage(chat.id, flags.before) : undefined;
  const raw = () => useChatStore.getState().messages[chat.id] ?? [];
  const shown = () => raw().filter(showsInPreview);
  const endOf = () => (cutoff ? shown().findIndex((m) => m.id === cutoff.id) : shown().length);
  while (endOf() < count && useChatStore.getState().messageHistory[chat.id]?.hasOlder !== false) {
    const before = raw().length;
    await useChatStore.getState().loadOlderMessages(chat.id);
    if (raw().length === before) break;
  }
  const end = endOf();
  const page = shown().slice(Math.max(0, end - count), end);
  if (flags['mark-read']) await useChatStore.getState().markRead(chat.id);

  const names = await displayNames(
    chat.protocol,
    page.map((m) => m.senderId)
  );
  return {
    data: page.map((m) => messageJson(m, names)),
    text: page.length ? page.map((m) => messageLine(m, names)) : 'No messages.',
  };
}

const FILTERS: ChatFilter[] = ['unread', 'mentions'];

function requireNetwork(named: string): NetworkId {
  const wanted = named.toLowerCase();
  const network = NETWORK_IDS.find(
    (id) => id === wanted || networkLabel(id).toLowerCase() === wanted
  );
  if (!network) {
    throw new CliError(`No network "${named}". Known: ${NETWORK_IDS.join(', ')}.`, 'notFound');
  }
  return network;
}

export const chatHandlers = {
  async chats({ flags }) {
    await whenAccountReady();
    const { chats, chatPrefs, readAt } = useChatStore.getState();
    const context = { prefs: chatPrefs, readAt };
    const limit = flags.limit === undefined ? Infinity : Number(flags.limit);
    const { accepted, requests, blocked } = splitRequests(chats);
    const network = typeof flags.network === 'string' ? requireNetwork(flags.network) : undefined;
    const listed = flags.blocked ? blocked : flags.requests ? requests : accepted;
    const picked = listed.filter((c) => {
      if (!flags.blocked && Boolean(flags.archived) !== Boolean(prefsFor(chatPrefs, c.id).archived))
        return false;
      if (flags.dms && !matchesFilter(c, 'dms', context)) return false;
      if (flags.groups && !matchesFilter(c, 'groups', context)) return false;
      if (network && networkIn(c) !== network) return false;
      return FILTERS.every((f) => !flags[f] || matchesFilter(c, f, context));
    });
    const ordered = orderChats(picked, chatPrefs, { includeArchived: true }).slice(0, limit);
    const labels = await chatLabels(ordered);
    const data = ordered.map((c) => chatJson(c, labels.get(c.id)));
    return { data, text: data.length ? data.map(chatLine) : 'No chats.' };
  },

  async chat({ args }) {
    const chat = await readyChat(args.chat!);
    const store = useChatStore.getState();
    const info = chat.kind === 'dm' ? {} : await store.getGroupInfo(chat.id).catch(() => ({}));
    const data = {
      ...chatJson(chat, {
        title: chat.label,
        participant: chat.participant,
        address: chat.address,
      }),
      members: chat.memberCount ?? chat.memberIds.length,
      role: chat.selfRole,
      online: chat.online,
      lastSeenAt: chat.lastSeenAt ? new Date(chat.lastSeenAt).toISOString() : undefined,
      pendingJoinRequests: chat.pendingJoinRequests,
      ...info,
    };
    const lines = Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== false && value !== '')
      .map(
        ([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`
      );
    return { data, text: lines };
  },

  read: readChat,

  async search({ args, flags }) {
    await whenAccountReady();
    const inChat = typeof flags.in === 'string' ? await findChat(flags.in) : undefined;
    const found = await useChatStore.getState().searchMessages(args.query!, inChat?.id);
    const inResults = new Set(found.map((m) => m.chatId));
    const labels = await chatLabels(
      useChatStore.getState().chats.filter((c) => inResults.has(c.id))
    );
    const titles = new Map([...labels].map(([id, l]) => [id, l.title]));
    return {
      data: found.map((m) => ({ ...messageJson(m), chatTitle: titles.get(m.chatId) })),
      text: found.length
        ? found.map((m) => `${titles.get(m.chatId) ?? m.chatId} › ${messageLine(m)}`)
        : 'Nothing found.',
    };
  },

  async 'mark-read'({ args }) {
    const chat = await readyChat(args.chat!);
    await useChatStore.getState().markRead(chat.id);
    return { data: { id: chat.id, read: true }, text: `Marked ${chat.label} as read.` };
  },

  async 'mark-unread'({ args }) {
    const chat = await readyChat(args.chat!);
    await useChatStore.getState().markUnread(chat.id);
    return { data: { id: chat.id, read: false }, text: `Marked ${chat.label} as unread.` };
  },

  async accept({ args }) {
    const chat = await readyChat(args.chat!);
    await useChatStore.getState().setConsent(chat.id, 'accepted');
    return {
      data: { id: chat.id, consent: 'accepted' },
      text: `Moved ${chat.label} to your chats.`,
    };
  },

  async decline({ args }) {
    const chat = await readyChat(args.chat!);
    await useChatStore.getState().setConsent(chat.id, 'declined');
    return { data: { id: chat.id, consent: 'declined' }, text: `Declined ${chat.label}.` };
  },

  pin: setPref({ pinned: true }, 'Pinned'),
  unpin: setPref({ pinned: false }, 'Unpinned'),
  mute: setPref({ muted: true }, 'Muted'),
  unmute: setPref({ muted: false }, 'Unmuted'),
  archive: setPref({ archived: true }, 'Archived'),
  unarchive: setPref({ archived: false }, 'Unarchived'),
  block: setBlocked(true, 'Blocked'),
  unblock: setBlocked(false, 'Unblocked'),

  async draft({ args }) {
    const chat = await readyChat(args.chat!);
    if (args.text === undefined) {
      const text = draftOf(chat) ?? '';
      return { data: { id: chat.id, draft: text }, text: text || '(no draft)' };
    }
    const text = args.text;
    useChatStore.getState().setDraft(chat.id, text);
    return { data: { id: chat.id, draft: text }, text: text ? 'Draft saved.' : 'Draft cleared.' };
  },
} satisfies Record<string, CliHandler>;

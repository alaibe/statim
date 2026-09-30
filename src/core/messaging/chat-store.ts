import { create } from 'zustand';

import { reportError } from '../app/report-error';

import { botChatId, botIdFromChat, isLocalChat, SAVED_LOCAL_ID, toContent, type Bot } from './bots';
import {
  LOCAL_PROTOCOL,
  namespaceChat,
  namespaceMessage,
  namespacedId,
  protocolEntries,
  protocolOf,
  splitChatId,
  type ProtocolId,
} from './namespace';
import { saveChatPrefs, withPref, type ChatPrefs, type ChatPrefsMap } from './chat-prefs';
import { indexMessages, saveMediaIndexSoon, type MediaIndex } from './media-index';
import { useAppearanceStore } from '../app/appearance';
import { writeReadState } from './read-state';
import { foldReactions, hasReacted } from './reactions';
import type {
  ChatSession,
  GroupInfo,
  JoinRequest,
  MentionCandidate,
  PublicChatPreview,
  XmtpCapabilities,
} from './protocol';
import { historyFailure } from './history';
import { HYDRATE_LIMIT, type MessageStore } from './message-store';
import { persistLocalAttachment } from './attachments';
import { stickerAsImage } from './stickers';
import { MARKED_UNREAD } from './unread';
import { searchMessages } from './search';
import { draftKey, draftSync, saveDraftsSoon, withDraft, type Drafts } from './drafts';
import { capability, type Capability, type CapabilityMethod } from './capability';
import { chatPermissions } from './permissions';
import type { AccountStorage } from '@/storage/account';
import type {
  ChatMessage,
  MessageId,
  Chat,
  ChatId,
  GroupMember,
  MessageContent,
  ParticipantId,
  ProtocolChatId,
  Unsubscribe,
  ConsentDecision,
  ProtocolChat,
} from './types';
import { errorMessage, NotConnectedError } from '../errors';
import { sameValue } from '@/lib/same-value';

export type ConnectionStatus = 'idle' | 'connecting' | 'ready' | 'error' | 'erasing';

export interface ProtocolConnection {
  status: ConnectionStatus;
  error: string | null;
  history: import('./history').HistoryState;
  login: import('./protocol').LoginState | null;
}

export const NO_CONNECTION: Readonly<ProtocolConnection> = Object.freeze({
  status: 'idle',
  error: null,
  history: Object.freeze({ status: 'idle' }),
  login: null,
});

export function connectionFor(
  protocols: Partial<Record<ProtocolId, ProtocolConnection>>,
  id: ProtocolId
): Readonly<ProtocolConnection> {
  return protocols[id] ?? NO_CONNECTION;
}

export interface ChatState {
  status: ConnectionStatus;
  error: string | null;
  sessions: Partial<Record<ProtocolId, ChatSession>>;
  protocols: Partial<Record<ProtocolId, ProtocolConnection>>;
  accountId: string | null;

  chats: readonly Chat[];
  messages: Record<ChatId, readonly ChatMessage[]>;
  rawMessages: Record<ChatId, readonly ChatMessage[]>;
  messageHistory: Record<ChatId, MessageHistoryState>;
  syncing: boolean;
  bots: Record<string, Bot>;
  readAt: Record<ChatId, number>;
  chatPrefs: ChatPrefsMap;
  drafts: Drafts;
  mediaIndex: MediaIndex;
  messageStore: MessageStore | null;
  accountStorage: AccountStorage | null;

  registerBots(bots: Bot[]): Promise<void>;
  postLocalMessage(
    id: ChatId,
    content: MessageContent,
    from: 'me' | 'bot',
    replyTo?: MessageId
  ): Promise<void>;

  postPrivateMessage(id: ChatId, content: MessageContent): Promise<void>;

  refreshChats(): Promise<void>;
  loadMessages(id: ChatId): Promise<void>;
  loadOlderMessages(id: ChatId): Promise<void>;
  searchMessages(query: string, id?: ChatId): Promise<ChatMessage[]>;
  sendMessage(
    id: ChatId,
    content: MessageContent,
    replyTo?: MessageId,
    threadRoot?: MessageId
  ): Promise<SendOutcome>;
  resolveParticipant(protocol: ProtocolId, addressOrId: string): Promise<ParticipantId | null>;
  startDm(protocol: ProtocolId, participant: ParticipantId): Promise<Chat>;
  startGroup(protocol: ProtocolId, participants: ParticipantId[], title: string): Promise<Chat>;
  previewPublicChat(protocol: ProtocolId, input: string): Promise<PublicChatPreview>;
  joinPublicChat(protocol: ProtocolId, reference: string): Promise<Chat | null>;
  createInviteLink(id: ChatId, requiresApproval: boolean): Promise<string>;
  getJoinRequests(id: ChatId): Promise<JoinRequest[]>;
  processJoinRequest(id: ChatId, participantId: ParticipantId, approve: boolean): Promise<void>;
  sync(): Promise<void>;
  syncProtocol(protocolId: ProtocolId): Promise<void>;

  getMembers(id: ChatId): Promise<GroupMember[]>;
  mentionCandidates(id: ChatId, query: string): Promise<MentionCandidate[]>;
  getGroupInfo(id: ChatId): Promise<GroupInfo>;
  setSlowModeDelay(id: ChatId, seconds: number): Promise<void>;
  addMembers(id: ChatId, participants: ParticipantId[]): Promise<void>;
  removeMembers(id: ChatId, participants: ParticipantId[]): Promise<void>;
  banMember(id: ChatId, participant: ParticipantId): Promise<void>;
  setMemberMuted(id: ChatId, participant: ParticipantId, muted: boolean): Promise<void>;
  renameGroup(id: ChatId, title: string): Promise<void>;
  leaveGroup(id: ChatId): Promise<void>;

  react(chatId: ChatId, messageId: MessageId, emoji: string): Promise<void>;

  markRead(id: ChatId): Promise<void>;
  setTyping(id: ChatId, typing: boolean): Promise<void>;
  watchPresence(id: ChatId): Unsubscribe;
  markUnread(id: ChatId): Promise<void>;
  setConsent(id: ChatId, consent: ConsentDecision): Promise<void>;
  setChatPref(id: ChatId, change: Partial<ChatPrefs>): Promise<void>;
  setDraft(id: ChatId, text: string, thread?: MessageId): void;

  ingestMessage(message: ChatMessage): void;
  ingestChat(chat: Chat): void;
  ingestChats(chats: Chat[]): void;
  replacePending(
    chatId: ChatId,
    pendingId: string,
    status: ChatMessage['status'],
    sentId?: MessageId
  ): void;
  retryMessage(chatId: ChatId, messageId: string): Promise<SendOutcome | null>;
  editMessage(id: ChatId, messageId: MessageId, text: string): Promise<void>;
  deleteMessage(id: ChatId, messageId: MessageId, forEveryone: boolean): Promise<void>;
  votePoll(id: ChatId, messageId: MessageId, optionIds: number[]): Promise<void>;
  createPoll(id: ChatId, question: string, options: string[]): Promise<void>;
  listPinnedMessages(id: ChatId): Promise<ChatMessage[]>;
  setMessagePinned(id: ChatId, messageId: MessageId, pinned: boolean): Promise<void>;
  fetchMedia(id: ChatId, messageId: MessageId): Promise<void>;
  removeMessages(id: ChatId, messageIds: MessageId[]): void;
}

/** A failed send stays in the chat, marked, for the person to retry; the error is only reported. */
export type SendOutcome = { sent: true } | { sent: false; messageId: MessageId; error: unknown };

export interface MessageHistoryState {
  loading: boolean;
  hasOlder: boolean;
  error?: string;
}

const PRIMARY_PROTOCOL: ProtocolId = 'xmtp';

const FIRST_PAGE = 50;

const EMPTY = Object.freeze({});
const NONE = Object.freeze([]);

export const EMPTY_PROJECTION = Object.freeze({
  status: 'idle',
  error: null,
  sessions: EMPTY,
  protocols: EMPTY,
  accountId: null,
  accountStorage: null,
  messageStore: null,
  chats: NONE,
  messages: EMPTY,
  rawMessages: EMPTY,
  messageHistory: EMPTY,
  syncing: false,
  bots: EMPTY,
  readAt: EMPTY,
  chatPrefs: EMPTY,
  drafts: EMPTY,
  mediaIndex: EMPTY,
}) satisfies Partial<ChatState>;

export const useChatStore = create<ChatState>((set, get) => ({
  ...EMPTY_PROJECTION,

  async refreshChats() {
    const accountId = get().accountId;
    const entries = protocolEntries(get().sessions);
    if (entries.length === 0) return;

    const results = await Promise.allSettled(
      entries.map(async ([protocolId, session]) =>
        (await session.listChats()).map((c) => namespaceChat(protocolId, c))
      )
    );

    const remote = results.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
    if (!sameSessions(get(), accountId, entries)) return;
    const local = get().chats.filter((c) => isLocalChat(c.id));
    set({ chats: sortChats([...local, ...remote]) });
  },

  async loadMessages(id) {
    if (!isLocalChat(id) && !routeOrNull(get(), id)) return;
    const accountId = get().accountId;
    const opened = get().messageHistory[id];
    const project = (
      page: ChatMessage[],
      hasOlder: boolean,
      loading = false,
      merge = mergePage
    ) => {
      set((state) => ({
        ...withRaw(state, id, merge(rawOf(state, id), page)),
        messageHistory: { ...state.messageHistory, [id]: { loading, hasOlder } },
      }));
      const indexed = indexMessages(get().mediaIndex, id, page);
      if (indexed !== get().mediaIndex) {
        set({ mediaIndex: indexed });
        saveMediaIndexSoon(requireAccountStorage(get()), indexed);
      }
    };

    try {
      const newest = await loadMessagePage(get(), id, FIRST_PAGE);
      if (get().accountId !== accountId) return;
      const more = newest.length === FIRST_PAGE;
      if (opened) {
        project(newest, opened.error ? more : opened.hasOlder);
        return;
      }
      project(newest, more, more);
      if (!more) return;

      const rest = HYDRATE_LIMIT - FIRST_PAGE;
      const older = await loadMessagePage(get(), id, rest, newest);
      if (get().accountId !== accountId) return;
      project(older, older.length === rest, false, (loaded, page) => dedupe([...page, ...loaded]));
    } catch (error) {
      if (get().accountId !== accountId) return;
      set((state) => ({
        messageHistory: {
          ...state.messageHistory,
          [id]: {
            loading: false,
            hasOlder: state.messageHistory[id]?.hasOlder ?? false,
            error: errorMessage(error, 'Could not load messages'),
          },
        },
      }));
    }
  },

  async loadOlderMessages(id) {
    const current = get().messageHistory[id];
    if (current?.loading || current?.hasOlder === false) return;
    const existing = get().messages[id] ?? [];
    if (existing.length === 0) return;
    const accountId = get().accountId;

    set((state) => ({
      messageHistory: {
        ...state.messageHistory,
        [id]: { ...state.messageHistory[id], loading: true, hasOlder: true, error: undefined },
      },
    }));

    try {
      const page = await loadMessagePage(get(), id, 100, existing);
      if (get().accountId !== accountId) return;
      set((state) => ({
        ...withRaw(state, id, dedupe([...page, ...rawOf(state, id)])),
        messageHistory: {
          ...state.messageHistory,
          [id]: { loading: false, hasOlder: page.length === 100 },
        },
      }));
    } catch (error) {
      if (get().accountId !== accountId) return;
      set((state) => ({
        messageHistory: {
          ...state.messageHistory,
          [id]: {
            loading: false,
            hasOlder: true,
            error: errorMessage(error, 'Could not load earlier messages'),
          },
        },
      }));
    }
  },

  searchMessages(query, id) {
    return searchMessages(get(), query, id);
  },

  async sendMessage(id, picked, replyTo, threadRoot) {
    requireSendable(get(), id);
    if (isLocalChat(id)) {
      await get().postLocalMessage(id, picked, 'me', replyTo);

      const bot = get().bots[botIdFromChat(id)];
      if (bot?.onMessage && picked.kind === 'text') {
        await bot.onMessage(picked.text, {
          chatId: id,
          say: (reply) => get().postLocalMessage(id, toContent(reply), 'bot'),
        });
      }
      return { sent: true };
    }

    const route = requireRoute(get(), id);
    const accountId = get().accountId;
    const pendingId = `pending:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const outgoing =
      picked.kind === 'sticker' && !route.session.sendsStickers ? stickerAsImage(picked) : picked;
    const content =
      'uri' in outgoing && accountId
        ? await persistLocalAttachment(pendingId, outgoing, accountId)
        : outgoing;

    const pending: ChatMessage = {
      id: pendingId,
      chatId: id,
      senderId: route.session.self.participantId,
      sentAt: Date.now(),
      content,
      fromMe: true,
      status: 'sending',
      replyTo,
      threadRoot,
    };
    set((state) => withRaw(state, id, [...rawOf(state, id), pending]));

    try {
      const sentId = await route.session.send(route.nativeId, content, replyTo, threadRoot);
      get().replacePending(id, pending.id, 'sent', sentId);
      return { sent: true };
    } catch (error) {
      get().replacePending(id, pending.id, 'failed');
      console.warn('[chat] send failed', error);
      reportError(error);
      return { sent: false, messageId: pending.id, error };
    }
  },

  async retryMessage(id, messageId) {
    const message = (get().messages[id] ?? []).find((m) => m.id === messageId);
    if (!message || message.status !== 'failed') return null;

    const route = requireRoute(get(), id);
    get().replacePending(id, messageId, 'sending');

    try {
      const sentId = await route.session.send(
        route.nativeId,
        message.content,
        message.replyTo,
        message.threadRoot
      );
      get().replacePending(id, messageId, 'sent', sentId);
      return { sent: true };
    } catch (error) {
      get().replacePending(id, messageId, 'failed');
      console.warn('[chat] retry failed', error);
      reportError(error);
      return { sent: false, messageId, error };
    }
  },

  editMessage(id, messageId, text) {
    return onChat(get(), id, 'editMessage', messageId, text);
  },

  async deleteMessage(id, messageId, forEveryone) {
    const accountId = get().accountId;
    const route = requireRoute(get(), id);
    const remove = capability(route.session, forEveryone ? 'deleteMessage' : 'deleteMessageForMe');
    await remove(route.nativeId, messageId);
    if (!sameSession(get(), accountId, route.protocol, route.session)) return;
    get().removeMessages(id, [messageId]);
  },

  votePoll(id, messageId, optionIds) {
    return onChat(get(), id, 'votePoll', messageId, optionIds);
  },

  async createPoll(id, question, options) {
    requireSendable(get(), id);
    return onChat(get(), id, 'createPoll', question, options);
  },

  async listPinnedMessages(id) {
    const protocol = requireRoute(get(), id).protocol;
    return (await onChat(get(), id, 'listPinnedMessages')).map((message) =>
      namespaceMessage(protocol, message)
    );
  },

  setMessagePinned(id, messageId, pinned) {
    return onChat(get(), id, 'setMessagePinned', messageId, pinned);
  },

  fetchMedia(id, messageId) {
    return onChat(get(), id, 'fetchMedia', messageId);
  },

  removeMessages(id, messageIds) {
    const removed = new Set(messageIds);
    set((state) => {
      const raw = state.rawMessages[id] ?? state.messages[id];
      const kept = raw?.filter((message) => !removed.has(message.id));
      const existing = state.mediaIndex[id];
      const indexed = existing?.filter((entry) => !removed.has(entry.messageId));
      const mediaIndex =
        indexed && indexed.length !== existing?.length
          ? { ...state.mediaIndex, [id]: indexed }
          : state.mediaIndex;
      if (mediaIndex !== state.mediaIndex && state.accountStorage)
        saveMediaIndexSoon(state.accountStorage, mediaIndex);
      return {
        ...(kept ? withRaw(state, id, kept) : {}),
        mediaIndex,
        chats: chatsAfterRemoval(state.chats, id, removed, kept),
      };
    });
  },

  async resolveParticipant(protocol, addressOrId) {
    const session = get().sessions[protocol];
    if (!session) throw new NotConnectedError(protocol);
    return session.resolveParticipant(addressOrId);
  },

  startDm(protocol, participant) {
    return startChat(get, protocol, (session) => session.createDm(participant));
  },

  startGroup(protocol, participants, title) {
    return startChat(get, protocol, (session) => session.createGroup(participants, title));
  },

  async previewPublicChat(protocol, input) {
    return capability(requireSession(get(), protocol), 'previewPublicChat')(input);
  },

  joinPublicChat(protocol, reference) {
    return joinChat(get, protocol, (session) => capability(session, 'joinPublicChat')(reference));
  },

  createInviteLink(id, requiresApproval) {
    return onChat(get(), id, 'createInviteLink', requiresApproval);
  },

  getJoinRequests(id) {
    return onChat(get(), id, 'getJoinRequests');
  },

  processJoinRequest(id, participantId, approve) {
    return onChat(get(), id, 'processJoinRequest', participantId, approve);
  },

  async getMembers(id) {
    const route = requireRoute(get(), id);
    return route.session.getMembers(route.nativeId);
  },

  mentionCandidates(id, query) {
    return onChat(get(), id, 'mentionCandidates', query);
  },

  getGroupInfo(id) {
    return onChat(get(), id, 'getGroupInfo');
  },

  setSlowModeDelay(id, seconds) {
    return onChat(get(), id, 'setSlowModeDelay', seconds);
  },

  addMembers(id, participants) {
    return afterRoute(get, id, (route) => route.session.addMembers(route.nativeId, participants));
  },

  removeMembers(id, participants) {
    return afterRoute(get, id, (route) =>
      route.session.removeMembers(route.nativeId, participants)
    );
  },

  banMember(id, participant) {
    return onChat(get(), id, 'banMember', participant);
  },

  setMemberMuted(id, participant, muted) {
    return onChat(get(), id, 'setMemberMuted', participant, muted);
  },

  renameGroup(id, title) {
    return afterRoute(get, id, (route) => route.session.renameGroup(route.nativeId, title));
  },

  async leaveGroup(id) {
    const accountId = get().accountId;
    const route = requireRoute(get(), id);
    await route.session.leaveGroup(route.nativeId);
    if (!sameSession(get(), accountId, route.protocol, route.session)) return;

    set((state) => {
      const { [id]: _messages, ...messages } = state.messages;
      const { [id]: _raw, ...rawMessages } = state.rawMessages;
      return {
        chats: state.chats.filter((c) => c.id !== id),
        messages,
        rawMessages,
      };
    });
  },

  async sync() {
    const sessions = protocolEntries(get().sessions);
    if (sessions.length === 0 || get().syncing) return;
    const accountId = get().accountId;
    set({ syncing: true });
    try {
      await Promise.allSettled(sessions.map(([protocolId]) => get().syncProtocol(protocolId)));
    } finally {
      if (
        get().accountId === accountId &&
        sessions.every(([id, session]) => get().sessions[id] === session)
      ) {
        set({ syncing: false });
      }
    }
  },

  async syncProtocol(protocolId) {
    const session = get().sessions[protocolId];
    if (!session || connectionFor(get().protocols, protocolId).history.status === 'fetching')
      return;
    const accountId = get().accountId;
    const current = () => get().accountId === accountId && get().sessions[protocolId] === session;
    const report = (history: import('./history').HistoryState) => {
      if (current())
        setProtocol(set, protocolId, { ...connectionFor(get().protocols, protocolId), history });
    };
    report({ status: 'fetching' });
    try {
      await session.sync();
      const chats = (await session.listChats()).map((chat) => namespaceChat(protocolId, chat));
      if (!current()) return;
      get().ingestChats(chats);
      await Promise.all(
        chats.map(({ id }) => (get().messages[id] ? get().loadMessages(id) : undefined))
      );
      report({ status: 'idle' });
    } catch (error) {
      report(historyFailure(error));
    }
  },

  async registerBots(bots) {
    const forAccount = get().accountId;
    const stale = () => get().accountId !== forAccount;

    const byId = Object.fromEntries(bots.map((b) => [b.id, b]));
    set({ bots: byId });
    const store = requireMessageStore(get());
    const localChats = await store.loadChats(LOCAL_PROTOCOL);
    if (stale()) return;
    const storedChats = new Map(localChats.map((chat) => [chat.id, chat]));

    const fresh = bots.filter((bot) => {
      const id = botChatId(bot.id);
      return !get().chats.some((c) => c.id === id);
    });

    const loaded = await Promise.all(
      fresh.map(async (bot) => {
        const id = botChatId(bot.id);
        const raw = await store.loadMessages(id, HYDRATE_LIMIT);
        const createdAt =
          storedChats.get(id)?.createdAt ??
          raw[0]?.sentAt ??
          (id === SAVED_LOCAL_ID ? 0 : Date.now());
        await store.upsertChat({
          id,
          protocolId: LOCAL_PROTOCOL,
          participants: [bot.id],
          title: bot.name,
          createdAt,
          hidden: false,
        });
        return { bot, raw, createdAt };
      })
    );
    if (stale()) return;

    if (loaded.length > 0) {
      set((state) => {
        let next = { messages: state.messages, rawMessages: state.rawMessages };
        const added: Chat[] = [];
        const present = new Set(state.chats.map((c) => c.id));
        for (const { bot, raw, createdAt } of loaded) {
          const id = botChatId(bot.id);
          if (present.has(id)) continue;
          present.add(id);
          next = withRaw(next, id, raw);
          const messages = next.messages[id];
          added.push({
            id,
            protocol: LOCAL_PROTOCOL,
            kind: 'dm',
            title: bot.name,
            memberIds: [bot.id],
            createdAt,
            consent: 'accepted',
            lastMessage: messages.at(-1),
          });
        }
        return {
          chats: sortChats([...state.chats, ...added]),
          ...next,
        };
      });
    }

    for (const { bot, raw } of loaded) {
      if (raw.length > 0) continue;
      const id = botChatId(bot.id);
      for (const line of bot.greeting()) {
        if (stale()) return;
        await get().postLocalMessage(id, toContent(line), 'bot');
      }
    }

    if (stale()) return;

    const liveIds = new Set(bots.map((b) => botChatId(b.id)));
    set((state) => ({
      chats: state.chats.filter((c) => !isLocalChat(c.id) || liveIds.has(c.id)),
    }));
  },

  async postLocalMessage(id, content, from, replyTo) {
    const accountId = get().accountId;
    const store = requireMessageStore(get());
    const messageId = `${id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    if (!accountId) throw new Error('No account is active.');
    const storedContent = await persistLocalAttachment(messageId, content, accountId);
    if (get().accountId !== accountId) return;
    const message: ChatMessage = {
      id: messageId,
      chatId: id,
      senderId: from === 'me' ? 'me' : botIdFromChat(id),
      sentAt: localSentAt(get().messages[id], Date.now()),
      content: storedContent,
      fromMe: from === 'me',
      status: 'sent',
      replyTo,
    };

    await store.insertMessage(message);
    if (get().accountId !== accountId || get().messageStore !== store) return;
    set((state) => ({
      ...withRaw(state, id, [...rawOf(state, id), message]),
      chats: sortChats(state.chats.map((c) => (c.id === id ? { ...c, lastMessage: message } : c))),
    }));
  },

  async postPrivateMessage(id, content) {
    const accountId = get().accountId;
    const store = requireMessageStore(get());
    const messageId = `private:${id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    if (!accountId) throw new Error('No account is active.');
    const message: ChatMessage = {
      id: messageId,
      chatId: id,
      senderId: 'local',
      sentAt: Date.now(),
      content: await persistLocalAttachment(messageId, content, accountId),
      fromMe: false,
      status: 'sent',
      privateToMe: true,
    };

    await store.insertMessage(message);
    if (get().accountId !== accountId || get().messageStore !== store) return;
    set((state) => withRaw(state, id, [...rawOf(state, id), message]));
  },

  setDraft(id, text, thread) {
    const drafts = withDraft(get().drafts, draftKey(id, thread), text);
    set({ drafts });
    saveDraftsSoon(requireAccountStorage(get()), drafts);
    if (thread) return;
    const route = routeOrNull(get(), id);
    if (route?.session.saveDraft)
      draftSync.typed(id, text, (latest) =>
        capability(route.session, 'saveDraft')(route.nativeId, latest)
      );
  },

  async setChatPref(id, change) {
    const next = withPref(get().chatPrefs, id, change);
    set({ chatPrefs: next });
    await saveChatPrefs(requireAccountStorage(get()), next);
  },

  async markRead(id) {
    const now = Date.now();
    set((state) => ({ readAt: { ...state.readAt, [id]: now } }));
    await writeReadState(requireAccountStorage(get()), get().readAt);
    const route = routeOrNull(get(), id);
    if (get().chats.find((c) => c.id === id)?.markedUnread) markOnProtocol(route, false);

    if (!useAppearanceStore.getState().readReceipts) return;
    if (isLocalChat(id)) return;
    route?.session.sendReadReceipt?.(route.nativeId).catch(() => {});
  },

  async setTyping(id, typing) {
    if (!useAppearanceStore.getState().typingIndicators) return;
    const route = routeOrNull(get(), id);
    if (route?.session.setTyping) await route.session.setTyping(route.nativeId, typing);
  },

  watchPresence(id) {
    const route = routeOrNull(get(), id);
    return route?.session.watchPresence?.(route.nativeId) ?? (() => {});
  },

  async markUnread(id) {
    set((state) => ({ readAt: { ...state.readAt, [id]: MARKED_UNREAD } }));
    await writeReadState(requireAccountStorage(get()), get().readAt);
    markOnProtocol(routeOrNull(get(), id), true);
  },

  async setConsent(id, consent) {
    const route = routeOrNull(get(), id);
    if (!route?.session.setConsent) {
      throw new Error('This protocol has no way to decline a chat.');
    }

    const accountId = get().accountId;
    const chat = get().chats.find((c) => c.id === id);
    const previous = chat?.consent;
    if (consent === 'declined' && !(chat && chatPermissions(chat, route.session).answerRequest)) {
      throw new Error('Only a request can be declined.');
    }
    set((state) => ({
      chats: state.chats.map((c) => (c.id === id ? { ...c, consent } : c)),
    }));

    try {
      await route.session.setConsent(route.nativeId, consent);
    } catch (error) {
      if (previous && sameSession(get(), accountId, route.protocol, route.session)) {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === id && c.consent === consent ? { ...c, consent: previous } : c
          ),
        }));
      }
      throw error;
    }
  },

  ingestMessage(message: ChatMessage) {
    set((state) => {
      const id = message.chatId;
      const raw = state.rawMessages[id] ?? state.messages[id];
      const loaded = raw === undefined ? {} : withRaw(state, id, withMessage(raw, message));

      const touchesPreview = message.content.kind !== 'reaction';

      const indexed = indexMessages(state.mediaIndex, id, [message]);
      if (indexed !== state.mediaIndex && state.accountStorage) {
        saveMediaIndexSoon(state.accountStorage, indexed);
      }

      return {
        mediaIndex: indexed,
        ...loaded,
        chats: touchesPreview ? withPreview(state.chats, id, message) : state.chats,
      };
    });
  },

  async react(chatId, messageId, emoji) {
    const accountId = get().accountId;
    const store = requireMessageStore(get());
    const stored = get().messages[chatId] ?? [];
    const target = stored.find((m) => m.id === messageId);

    const applyLocally = (reaction: ChatMessage) => {
      set((state) => {
        const list = state.rawMessages[chatId] ?? state.messages[chatId];
        return list === undefined ? {} : withRaw(state, chatId, [...list, reaction]);
      });
    };

    if (isLocalChat(chatId)) {
      const action = reactionAction(target, emoji, 'me');
      const reaction = localReaction(chatId, messageId, emoji, 'me', action);
      await store.insertMessage(reaction);
      if (get().accountId !== accountId || get().messageStore !== store) return;
      applyLocally(reaction);
      return;
    }

    const route = routeOrNull(get(), chatId);
    if (!route) throw new Error('Not connected');

    const self = selfIdFor(get(), route.protocol);
    const action = reactionAction(target, emoji, self);

    const reaction = localReaction(chatId, messageId, emoji, self, action);
    applyLocally(reaction);
    try {
      await route.session.send(route.nativeId, {
        kind: 'reaction',
        targetId: messageId,
        emoji,
        action,
      });
    } catch (error) {
      if (sameSession(get(), accountId, route.protocol, route.session)) {
        get().removeMessages(chatId, [reaction.id]);
      }
      throw error;
    }
  },

  ingestChat(chat: Chat) {
    get().ingestChats([chat]);
  },

  ingestChats(chats: Chat[]) {
    if (chats.length === 0) return;
    const before = get();
    const next = mergeChats(before, chats, draftSync.received.bind(draftSync), Date.now());
    const { drafts, readAt } = next;
    if (next.chats === before.chats && drafts === before.drafts && readAt === before.readAt) return;
    set(next);

    const storage = before.accountStorage;
    if (!storage) return;
    if (drafts !== before.drafts) saveDraftsSoon(storage, drafts);
    if (readAt !== before.readAt)
      writeReadState(storage, readAt).catch((error) =>
        console.warn('[chat] could not save read state', error)
      );
  },

  replacePending(chatId, pendingId, status, sentId) {
    set((state) => {
      const raw = rawOf(state, chatId);
      if (sentId && raw.some((m) => m.id === sentId)) {
        return withRaw(
          state,
          chatId,
          raw.filter((m) => m.id !== pendingId)
        );
      }
      if (sentId) sentAs.set(sentId, pendingId);
      return withRaw(
        state,
        chatId,
        raw.map((m) => (m.id === pendingId ? { ...m, status } : m))
      );
    });
  },
}));

interface Route {
  protocol: ProtocolId;
  nativeId: ProtocolChatId;
  session: ChatSession;
}

function markOnProtocol(route: Route | null, unread: boolean): void {
  route?.session
    .setMarkedUnread?.(route.nativeId, unread)
    .catch((error) => console.warn('[chat] could not sync the unread mark', error));
}

/** Only a change on the protocol moves the mark, so an update sent before our own mark arrived does not undo it. */
function protocolMark(
  incoming: Chat,
  known: Chat | undefined,
  readAt: number | undefined,
  now: number
): number | undefined {
  if (incoming.markedUnread && !known?.markedUnread && readAt !== MARKED_UNREAD)
    return MARKED_UNREAD;
  if (known?.markedUnread && !incoming.markedUnread && readAt === MARKED_UNREAD) return now;
  return undefined;
}

function readThroughOwnMessage(chat: Chat, readAt: number | undefined): number | undefined {
  const last = chat.lastMessage;
  if (!last?.fromMe || readAt === MARKED_UNREAD || (readAt ?? 0) >= last.sentAt) return undefined;
  return last.sentAt;
}

type ChatList = Pick<ChatState, 'chats' | 'drafts' | 'readAt'>;

export function mergeChats(
  list: ChatList,
  incoming: readonly Chat[],
  adoptDraft: (id: ChatId, text: string, local: string) => string | undefined,
  now: number
): ChatList {
  const latest = new Map(list.chats.map((c) => [c.id, c]));
  const added = new Set<ChatId>();
  let { drafts, readAt } = list;
  let changed = false;
  let reorder = false;
  for (const chat of incoming) {
    const { id, draft } = chat;
    const known = latest.get(id);
    if (draft !== undefined) {
      const key = draftKey(id);
      const adopted = adoptDraft(id, draft, drafts[key] ?? '');
      if (adopted !== undefined) drafts = withDraft(drafts, key, adopted);
    }
    const read =
      protocolMark(chat, known, readAt[id], now) ?? readThroughOwnMessage(chat, readAt[id]);
    if (read !== undefined) readAt = { ...readAt, [id]: read };
    if (known && sameValue(known, chat)) continue;
    if (!known) added.add(id);
    latest.set(id, chat);
    changed = true;
    reorder ||= !known || recency(known) !== recency(chat);
  }
  if (!changed) return { chats: list.chats, drafts, readAt };
  const kept = list.chats.map((c) => latest.get(c.id)!);
  const chats = reorder ? sortChats([...[...added].map((id) => latest.get(id)!), ...kept]) : kept;
  return { chats, drafts, readAt };
}

function chatsAfterRemoval(
  chats: readonly Chat[],
  id: ChatId,
  removed: ReadonlySet<MessageId>,
  kept: readonly ChatMessage[] | undefined
): Chat[] {
  return sortChats(
    chats.map((chat) =>
      chat.id === id && chat.lastMessage && removed.has(chat.lastMessage.id)
        ? { ...chat, lastMessage: kept?.at(-1) }
        : chat
    )
  );
}

function reactionAction(
  target: ChatMessage | undefined,
  emoji: string,
  by: ParticipantId
): 'added' | 'removed' {
  return target && hasReacted(target, emoji, by) ? 'removed' : 'added';
}

function localSentAt(messages: readonly ChatMessage[] | undefined, now: number): number {
  return Math.max(now, (messages?.at(-1)?.sentAt ?? 0) + 1);
}

function routeOrNull(state: ChatState, id: ChatId): Route | null {
  const { protocol, nativeId } = splitChatId(id);
  const session = state.sessions[protocol];
  return session ? { protocol, nativeId, session } : null;
}

function requireRoute(state: ChatState, id: ChatId): Route {
  const route = routeOrNull(state, id);
  if (route) return route;

  const protocol = protocolOf(id);
  const { error } = connectionFor(state.protocols, protocol);
  throw new NotConnectedError(
    protocol,
    error ? `${protocol} is not connected: ${error}` : undefined
  );
}

type ChatArgs<K extends Capability> =
  CapabilityMethod<K> extends (id: ProtocolChatId, ...rest: infer R) => unknown ? R : never;

async function onChat<K extends Capability>(
  state: ChatState,
  id: ChatId,
  key: K,
  ...rest: ChatArgs<K>
): Promise<Awaited<ReturnType<CapabilityMethod<K>>>> {
  const route = requireRoute(state, id);
  const method = capability(route.session, key) as unknown as (
    nativeId: ProtocolChatId,
    ...args: unknown[]
  ) => Promise<Awaited<ReturnType<CapabilityMethod<K>>>>;
  return method(route.nativeId, ...rest);
}

function requireSendable(state: ChatState, id: ChatId): void {
  const chat = state.chats.find((c) => c.id === id);
  if (chat && !chatPermissions(chat, sessionFor(state, id)).send) {
    throw new Error('You cannot send messages in this chat.');
  }
}

function requireSession(state: ChatState, protocol: ProtocolId): ChatSession {
  const session = state.sessions[protocol];
  if (!session) throw new NotConnectedError(protocol);
  return session;
}

type Getter = () => ChatState;

async function afterRoute(
  get: Getter,
  id: ChatId,
  op: (route: Route) => Promise<void>
): Promise<void> {
  const accountId = get().accountId;
  const route = requireRoute(get(), id);
  await op(route);
  if (sameSession(get(), accountId, route.protocol, route.session)) await get().refreshChats();
}

async function startChat(
  get: Getter,
  protocol: ProtocolId,
  create: (session: ChatSession) => Promise<ProtocolChat>
): Promise<Chat> {
  const accountId = get().accountId;
  const session = requireSession(get(), protocol);
  const chat = namespaceChat(protocol, await create(session));
  if (sameSession(get(), accountId, protocol, session)) get().ingestChat(chat);
  return chat;
}

async function joinChat(
  get: Getter,
  protocol: ProtocolId,
  join: (session: ChatSession) => Promise<ProtocolChat | null>
): Promise<Chat | null> {
  const accountId = get().accountId;
  const session = requireSession(get(), protocol);
  const joined = await join(session);
  if (!joined) return null;
  const chat = namespaceChat(protocol, joined);
  if (sameSession(get(), accountId, protocol, session)) get().ingestChat(chat);
  return chat;
}

type MessageSlices = Pick<ChatState, 'messages' | 'rawMessages'>;

function rawOf(state: MessageSlices, id: ChatId): readonly ChatMessage[] {
  return state.rawMessages[id] ?? state.messages[id] ?? [];
}

function withRaw(state: MessageSlices, id: ChatId, raw: readonly ChatMessage[]): MessageSlices {
  return {
    rawMessages: { ...state.rawMessages, [id]: raw },
    messages: { ...state.messages, [id]: foldReactions(raw) },
  };
}

function requireMessageStore(state: ChatState): MessageStore {
  if (!state.messageStore) throw new Error('No account is active.');
  return state.messageStore;
}

function sameSession(
  state: ChatState,
  accountId: string | null,
  protocol: ProtocolId,
  session: ChatSession
): boolean {
  return state.accountId === accountId && state.sessions[protocol] === session;
}

function sameSessions(
  state: ChatState,
  accountId: string | null,
  entries: [ProtocolId, ChatSession][]
): boolean {
  return (
    state.accountId === accountId &&
    entries.every(([id, session]) => state.sessions[id] === session)
  );
}

function requireAccountStorage(state: ChatState): AccountStorage {
  if (!state.accountStorage) throw new Error('No account is active.');
  return state.accountStorage;
}

async function loadMessagePage(
  state: ChatState,
  id: ChatId,
  limit: number,
  loaded: readonly ChatMessage[] = []
): Promise<ChatMessage[]> {
  const local = requireMessageStore(state).loadMessages(id, limit, loaded[0]);
  if (isLocalChat(id)) return local;

  const route = routeOrNull(state, id);
  if (!route) return [];
  const before = loaded.find((message) => !message.privateToMe) ?? loaded[0];
  const [remote, privateMessages] = await Promise.all([
    route.session.getMessages(route.nativeId, { limit, before }),
    local,
  ]);
  return dedupe([
    ...remote.map((message) => namespaceMessage(route.protocol, message)),
    ...privateMessages,
  ]).slice(-limit);
}

function localReaction(
  chatId: ChatId,
  targetId: MessageId,
  emoji: string,
  senderId: ParticipantId,
  action: 'added' | 'removed'
): ChatMessage {
  return {
    id: `reaction:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    chatId,
    senderId,
    sentAt: Date.now(),
    content: { kind: 'reaction', targetId, emoji, action },
    fromMe: true,
    status: 'sent',
  };
}

type Setter = (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void;

function setProtocol(set: Setter, protocol: ProtocolId, connection: ProtocolConnection): void {
  set((state) => ({ protocols: { ...state.protocols, [protocol]: connection } }));
}

function mergePage(
  loaded: readonly ChatMessage[],
  page: readonly ChatMessage[]
): readonly ChatMessage[] {
  const oldest = page[0];
  if (!oldest) return loaded;
  const known = new Map(loaded.map((message) => [message.id, message]));
  return dedupe([
    ...loaded.filter(
      (message) => message.sentAt < oldest.sentAt || message.id.startsWith('pending:')
    ),
    ...page.map((message) => {
      const same = known.get(message.id);
      return same && sameValue(same, message) ? same : message;
    }),
  ]);
}

function withMessage(raw: readonly ChatMessage[], message: ChatMessage): readonly ChatMessage[] {
  const rest = removeMatchingPending(raw, message);
  const newest = rest.at(-1);
  if (!newest || (message.sentAt >= newest.sentAt && !rest.some((m) => m.id === message.id))) {
    return [...rest, message];
  }
  return dedupe([...rest, message]);
}

function dedupe(messages: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of messages) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.sentAt - b.sentAt);
}

// A protocol hands media back with its own file, so a sent message is matched to its echo by id.
const sentAs = new Map<MessageId, string>();

function removeMatchingPending(
  messages: readonly ChatMessage[],
  incoming: ChatMessage
): readonly ChatMessage[] {
  if (!incoming.fromMe) return messages;
  const pendingId = sentAs.get(incoming.id);
  if (pendingId) {
    sentAs.delete(incoming.id);
    return messages.filter((message) => message.id !== pendingId);
  }
  const content = JSON.stringify(incoming.content);
  const index = messages.findIndex(
    (message) =>
      message.id.startsWith('pending:') &&
      message.status !== 'failed' &&
      message.threadRoot === incoming.threadRoot &&
      message.replyTo === incoming.replyTo &&
      JSON.stringify(message.content) === content
  );
  if (index === -1) return messages;
  return [...messages.slice(0, index), ...messages.slice(index + 1)];
}

function withPreview(chats: readonly Chat[], id: ChatId, message: ChatMessage): readonly Chat[] {
  const index = chats.findIndex((c) => c.id === id);
  const current = chats[index];
  const last = current?.lastMessage;
  if (!current || (last && last.id !== message.id && message.sentAt < last.sentAt)) {
    return chats;
  }
  const next = [...chats];
  next[index] = { ...current, lastMessage: message };
  return recency(current) === message.sentAt ? next : sortChats(next);
}

function recency(chat: Chat): number {
  return chat.lastMessage?.sentAt ?? chat.createdAt;
}

function sortChats(chats: readonly Chat[]): Chat[] {
  return [...chats].sort((a, b) => recency(b) - recency(a));
}

export function selfIdFor(state: Pick<ChatState, 'sessions'>, protocol: ProtocolId): string {
  return state.sessions[protocol]?.self.participantId ?? '';
}

export function sessionFor(
  state: Pick<ChatState, 'sessions'>,
  id: ChatId
): ChatSession | undefined {
  return state.sessions[protocolOf(id)];
}

export function xmtpSessionFor(
  state: Pick<ChatState, 'sessions'>
): (ChatSession & Partial<XmtpCapabilities>) | null {
  return state.sessions[PRIMARY_PROTOCOL] ?? null;
}

export function projectAccount(storage: AccountStorage): void {
  sentAs.clear();
  useChatStore.setState({
    ...EMPTY_PROJECTION,
    accountId: storage.accountId,
    accountStorage: storage,
    messageStore: storage.messages,
  });
}

export function showCachedChats(cached: Chat[]): void {
  if (cached.length === 0) return;
  useChatStore.setState((state) => {
    const shown = new Set(state.chats.map((chat) => chat.id));
    const added = cached.filter((chat) => !shown.has(chat.id));
    return { chats: sortChats([...state.chats, ...added]) };
  });
}

export function dropChats(ids: ChatId[]): void {
  if (ids.length === 0) return;
  const gone = new Set(ids);
  useChatStore.setState((state) => ({
    chats: state.chats.filter((chat) => !gone.has(chat.id)),
  }));
}

export function clearChatProjection(status: ConnectionStatus = 'idle'): void {
  sentAs.clear();
  useChatStore.setState({ ...EMPTY_PROJECTION, status });
}

export { namespacedId };

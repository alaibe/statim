import { useAccountStore } from '@/core/account/account-store';
import { useLockStore } from '@/core/account/lock-store';
import type { AccountRecord } from '@/core/account/accounts';
import { isLocalChat } from '@/core/messaging/bots';
import { selfIdFor, useChatStore } from '@/core/messaging/chat-store';
import { contentPreview } from '@/core/messaging/preview';
import type { ProtocolId } from '@/core/messaging/namespace';
import type { ChatMessage, Chat, ChatId, ParticipantId } from '@/core/messaging/types';
import {
  chatParticipants,
  chatTitle,
  displayName,
  resolveParticipants,
} from '@/core/messaging/display-names';
import type { PluginHostValue } from '@/core/plugins/host';
import type { PluginRegistry } from '@/core/plugins/registry';
import { CliError } from './errors';
import type { ParsedArgs } from './args';

export interface CliIo {
  json: boolean;
  tty: boolean;
  stdinTty: boolean;
  print(text: string): void;
  warn(text: string): void;
  prompt(text: string, secret?: boolean): Promise<string>;
  stdin(): Promise<Uint8Array>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  /** Asks the person at the app; resolves false when they decline. */
  approve(request: string): Promise<boolean>;
  showWindow(): Promise<void>;
  /** Settles when the terminal goes away. */
  closed: Promise<void>;
}

export interface CliEnv {
  io: CliIo;
  host: PluginHostValue;
}

export type CliOutput = { data: unknown; text?: string | string[] } | void;

export type CliHandler = (input: ParsedArgs, env: CliEnv) => Promise<CliOutput>;

type Store<S> = { getState(): S; subscribe(listener: (state: S) => void): () => void };

export function waitFor<S>(
  store: Store<S>,
  done: (state: S) => boolean,
  timeoutMs: number
): Promise<boolean> {
  if (done(store.getState())) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    const unsubscribe = store.subscribe((state) => {
      if (!done(state)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

/** Waits out startup: the lock check, then the account. */
export async function whenSettled(): Promise<void> {
  await waitFor(useLockStore, (s) => s.status !== 'checking', 10_000);
  await waitFor(useAccountStore, (s) => s.status !== 'loading', 30_000);
}

export async function whenUnlocked(): Promise<void> {
  await whenSettled();
  if (useLockStore.getState().status === 'locked') {
    throw new CliError(
      'The app is locked. Unlock it in the window: status-original open',
      'unavailable'
    );
  }
}

export async function whenAccountReady(): Promise<void> {
  await whenUnlocked();
  const accountState = useAccountStore.getState();
  if (accountState.status === 'absent') {
    throw new CliError(
      'There is no account yet. Run status-original accounts create, or accounts import.',
      'unavailable'
    );
  }
  if (accountState.status !== 'ready') {
    throw new CliError(accountState.error ?? 'The account could not be opened.', 'unavailable');
  }
  const accountId = accountState.activeAccountId;
  await waitFor(useChatStore, (s) => s.accountId === accountId, 30_000);
  if (settledFor === accountId) return;
  await waitFor(useChatStore, (s) => s.status === 'ready' || s.status === 'error', 15_000);
  settledFor = accountId;
}

/** Each account's protocols get one chance to connect and list their chats; a stuck one must not slow every command. */
let settledFor: string | null = null;

function describeChoices(items: string[]): string {
  const shown = items.slice(0, 10).map((line) => `  ${line}`);
  if (items.length > 10) shown.push(`  …and ${items.length - 10} more`);
  return shown.join('\n');
}

export function pick<T>(
  items: T[],
  ref: string,
  keys: (item: T) => (string | undefined)[],
  describe: (item: T) => string,
  noun: string
): T {
  const wanted = ref.trim().toLowerCase();
  const exact = items.filter((item) => keys(item).some((k) => k?.toLowerCase() === wanted));
  if (exact.length === 1) return exact[0];
  const partial = exact.length
    ? exact
    : items.filter((item) => keys(item).some((k) => k?.toLowerCase().includes(wanted)));
  if (partial.length === 1) return partial[0];
  if (partial.length === 0) throw new CliError(`No ${noun} matches "${ref}".`, 'notFound');
  throw new CliError(
    `"${ref}" matches ${partial.length} ${noun}s. Use the id:\n${describeChoices(partial.map(describe))}`,
    'notFound'
  );
}

export interface ChatLabel {
  title: string;
  participant?: ParticipantId;
  address?: string;
}

export type FoundChat = Chat & { label: string; participant?: ParticipantId; address?: string };

const participantCache = new Map<string, { name?: string; address?: string }>();

let namingRegistry: PluginRegistry | undefined;

/** The plugins whose names for people, such as bots you named, the next commands show. */
export function nameWith(registry: PluginRegistry): void {
  namingRegistry = registry;
}

async function participants(protocol: ProtocolId, ids: ParticipantId[]) {
  const key = (id: ParticipantId) => `${protocol}:${id}`;
  const missing = [...new Set(ids)].filter((id) => !participantCache.has(key(id)));
  if (missing.length && useChatStore.getState().sessions[protocol]) {
    const { names, addresses } = await resolveParticipants(protocol, missing);
    for (const id of missing)
      participantCache.set(key(id), { name: names[id], address: addresses[id] });
  }
  const own = (await namingRegistry?.participantNames().catch(() => undefined)) ?? {};
  return (id: ParticipantId) => {
    const found = participantCache.get(key(id));
    return {
      name: displayName(id, own[id] ?? found?.name, found?.address),
      address: found?.address,
    };
  };
}

/** Titles as the app shows them: a DM is named after the other person. */
export async function chatLabels(chats: readonly Chat[]): Promise<Map<ChatId, ChatLabel>> {
  const { sessions } = useChatStore.getState();
  const byProtocol = new Map<ProtocolId, Chat[]>();
  const out = new Map<ChatId, ChatLabel>();
  for (const chat of chats) {
    if (chat.kind === 'dm' && !isLocalChat(chat.id) && chat.protocol) {
      byProtocol.set(chat.protocol, [...(byProtocol.get(chat.protocol) ?? []), chat]);
    } else {
      out.set(chat.id, { title: chat.title });
    }
  }
  await Promise.all(
    [...byProtocol].map(async ([protocol, dms]) => {
      const self = selfIdFor({ sessions }, protocol);
      const participantOf = (c: Chat) => chatParticipants(c, self)[0]?.id ?? c.title;
      const lookup = await participants(protocol, dms.map(participantOf));
      for (const chat of dms) {
        const participant = participantOf(chat);
        const title = chatTitle(chat, self, (id) => lookup(id).name);
        out.set(chat.id, { title, participant, address: lookup(participant).address });
      }
    })
  );
  return out;
}

async function labelled(chats: readonly Chat[]): Promise<FoundChat[]> {
  const labels = await chatLabels(chats);
  return chats.map((c) => {
    const { title, participant, address } = labels.get(c.id) ?? { title: c.title };
    return { ...c, label: title, participant, address };
  });
}

export async function findChat(ref: string): Promise<FoundChat> {
  const chats = useChatStore.getState().chats;
  const byId = chats.find((c) => c.id === ref);
  if (byId) return (await labelled([byId]))[0];
  return pick(
    await labelled(chats),
    ref,
    (c) => [c.label, c.title, c.participant, c.address],
    (c) => `${c.id}  ${c.label}`,
    'chat'
  );
}

export async function readyChat(ref: string): Promise<FoundChat> {
  await whenAccountReady();
  return findChat(ref);
}

export async function readyMessage(chatRef: string, messageRef: string) {
  const chat = await readyChat(chatRef);
  return { chat, message: await findMessage(chat.id, messageRef) };
}

export function findAccount(ref: string): AccountRecord {
  return pick(
    useAccountStore.getState().accounts,
    ref,
    (a) => [a.id, a.label, a.address],
    (a) => `${a.id}  ${a.label}  ${a.address}`,
    'account'
  );
}

export async function loadedMessages(chatId: ChatId): Promise<readonly ChatMessage[]> {
  const store = useChatStore.getState();
  if (!store.messages[chatId]?.length) await store.loadMessages(chatId);
  return useChatStore.getState().messages[chatId] ?? [];
}

export const visible = (m: ChatMessage) => m.content.kind !== 'reaction';

export async function findMessage(chatId: ChatId, ref: string): Promise<ChatMessage> {
  let messages = await loadedMessages(chatId);
  if (ref === 'last') {
    const last = messages.filter(visible).at(-1);
    if (!last) throw new CliError('That chat has no messages.', 'notFound');
    return last;
  }
  for (let page = 0; page < 10; page++) {
    const found = messages.find((m) => m.id === ref) ?? uniquePrefix(messages, ref);
    if (found) return found;
    const history = useChatStore.getState().messageHistory[chatId];
    if (history && !history.hasOlder) break;
    await useChatStore.getState().loadOlderMessages(chatId);
    const next = useChatStore.getState().messages[chatId] ?? [];
    if (next.length === messages.length) break;
    messages = next;
  }
  throw new CliError(`No message "${ref}" in ${chatId}.`, 'notFound');
}

function uniquePrefix(messages: readonly ChatMessage[], ref: string): ChatMessage | undefined {
  if (ref.length < 6) return undefined;
  const matches = messages.filter((m) => m.id.startsWith(ref));
  return matches.length === 1 ? matches[0] : undefined;
}

export async function displayNames(
  protocol: ProtocolId,
  ids: ParticipantId[]
): Promise<Record<ParticipantId, string>> {
  if (ids.length === 0) return {};
  const lookup = await participants(protocol, [...new Set(ids)]);
  return Object.fromEntries(ids.map((id) => [id, lookup(id).name]));
}

export function messageJson(m: ChatMessage, names: Record<ParticipantId, string> = {}) {
  const c = m.content;
  const attachment =
    c.kind === 'image' || c.kind === 'file' || c.kind === 'voice' || c.kind === 'video'
      ? { name: c.name, mimeType: c.mimeType, size: c.size }
      : undefined;
  return {
    id: m.id,
    chat: m.chatId,
    from: m.fromMe ? 'me' : m.senderId,
    fromName: m.fromMe ? 'You' : (names[m.senderId] ?? m.senderId),
    sentAt: new Date(m.sentAt).toISOString(),
    kind: c.kind,
    text: c.kind === 'text' ? c.text : contentPreview(c),
    ...(attachment ? { attachment } : {}),
    ...(c.kind === 'poll'
      ? {
          poll: {
            question: c.question,
            options: c.options,
            closed: c.closed,
            multiple: c.multiple,
          },
        }
      : {}),
    ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    ...(m.reactions && Object.keys(m.reactions).length ? { reactions: m.reactions } : {}),
    ...(m.edited ? { edited: true } : {}),
    ...(m.isPinned ? { pinned: true } : {}),
    ...(m.forwarded ? { forwarded: true } : {}),
    status: m.status,
  };
}

export function messageLine(m: ChatMessage, names: Record<ParticipantId, string> = {}): string {
  const when = new Date(m.sentAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const who = m.fromMe ? 'You' : (names[m.senderId] ?? m.senderId);
  const body = m.content.kind === 'text' ? m.content.text : contentPreview(m.content);
  const marks = [m.edited ? 'edited' : '', m.status === 'failed' ? 'failed' : '']
    .filter(Boolean)
    .map((mark) => ` (${mark})`)
    .join('');
  return `${when}  ${who}: ${body}${marks}  [${m.id}]`;
}

export async function approveOrThrow(io: CliIo, request: string): Promise<void> {
  if (!(await io.approve(request))) throw new CliError('Declined in the app.', 'declined');
}

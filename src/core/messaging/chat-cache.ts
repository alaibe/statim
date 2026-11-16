import { isLocalChat } from "./bots";
import { dropChats, FIRST_PAGE } from "./chat-store";
import type { CachedPage, MessageStore } from "./message-store";
import { type ProtocolId, protocolOf } from "./namespace";
import type { Chat, ChatId, ChatMessage } from "./types";

const SAVE_DELAY_MS = 2_000;

function lasting({ typing: _typing, online: _online, lastSeenAt: _lastSeenAt, draft: _draft, ...rest }: Chat): Chat {
  return rest;
}

/**
 * The chat list as each protocol last listed it in full, shown at launch
 * before any protocol connects. A protocol's chats are written only once it has
 * listed everything, and a restored chat its full listing lacks is dropped.
 * The newest messages of each chat that was opened are kept too, for opening
 * it again before its protocol connects.
 */
export class ChatCache {
  private readonly written = new Map<ChatId, { source: Chat; json?: string }>();
  private readonly restored = new Map<ChatId, ProtocolId>();
  private readonly complete = new Set<ProtocolId>();
  private pending: readonly Chat[] | null = null;
  private readonly pagesWritten = new Map<ChatId, readonly ChatMessage[]>();
  private pendingPages: Readonly<Record<ChatId, readonly ChatMessage[]>> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly store: MessageStore) {}

  async restore(): Promise<Chat[]> {
    const cached = await this.store.cachedChats().catch(() => []);
    for (const chat of cached) {
      this.written.set(chat.id, { source: chat });
      this.restored.set(chat.id, chat.protocol);
    }
    return cached;
  }

  listed(protocol: ProtocolId, chats: Chat[]): void {
    this.complete.add(protocol);
    const present = new Set(chats.map((chat) => chat.id));
    const dropped = this.release(protocol, (id) => !present.has(id));
    if (dropped.length > 0) this.dropPages(dropped);
  }

  forget(protocol: ProtocolId): void {
    this.complete.delete(protocol);
    const drop = [...this.written].filter(([, row]) => row.source.protocol === protocol).map(([id]) => id);
    for (const id of drop) this.written.delete(id);
    if (drop.length > 0) {
      this.store.cacheChats([], drop).catch((error) => console.warn("[chat] could not forget cached chats", error));
    }
    for (const id of [...this.pagesWritten.keys()]) if (protocolOf(id) === protocol) this.pagesWritten.delete(id);
    this.store.forgetPages(protocol).catch((error) => console.warn("[chat] could not forget cached messages", error));
    this.release(protocol, () => true);
  }

  pause(protocol: ProtocolId): void {
    this.complete.delete(protocol);
  }

  saveSoon(chats: readonly Chat[]): void {
    this.pending = chats;
    this.timer ??= setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  savePagesSoon(messages: Readonly<Record<ChatId, readonly ChatMessage[]>>): void {
    this.pendingPages = messages;
    this.timer ??= setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.flushPages();
    const chats = this.pending;
    this.pending = null;
    if (!chats) return;

    for (const protocol of this.complete) {
      const keep: Chat[] = [];
      const present = new Set<ChatId>();
      for (const chat of chats) {
        if (chat.protocol !== protocol) continue;
        present.add(chat.id);
        const written = this.written.get(chat.id);
        if (written?.source === chat) continue;
        const row = lasting(chat);
        const json = JSON.stringify(row);
        this.written.set(chat.id, { source: chat, json });
        if (written && (written.json ?? JSON.stringify(written.source)) === json) continue;
        keep.push(row);
      }
      const drop = [...this.written]
        .filter(([id, row]) => row.source.protocol === protocol && !present.has(id))
        .map(([id]) => id);
      for (const id of drop) this.written.delete(id);
      if (keep.length === 0 && drop.length === 0) continue;
      await this.store
        .cacheChats(keep, drop)
        .catch((error) => console.warn("[chat] could not keep the chat list", error));
      if (drop.length > 0) this.dropPages(drop);
    }
  }

  private async flushPages(): Promise<void> {
    const pages = this.pendingPages;
    this.pendingPages = null;
    if (!pages) return;
    const keep: CachedPage[] = [];
    for (const [chatId, messages] of Object.entries(pages) as [ChatId, readonly ChatMessage[]][]) {
      if (isLocalChat(chatId)) continue;
      const kept = newestKept(messages);
      const written = this.pagesWritten.get(chatId);
      if (written && sameMessages(written, kept)) continue;
      this.pagesWritten.set(chatId, kept);
      keep.push({ chatId, messages: kept });
    }
    if (keep.length === 0) return;
    await this.store
      .cachePages(keep, [])
      .catch((error) => console.warn("[chat] could not keep the newest messages", error));
  }

  private dropPages(ids: ChatId[]): void {
    for (const id of ids) this.pagesWritten.delete(id);
    this.store.cachePages([], ids).catch((error) => console.warn("[chat] could not forget cached messages", error));
  }

  private release(protocol: ProtocolId, stale: (id: ChatId) => boolean): ChatId[] {
    const dropped: ChatId[] = [];
    for (const [id, owner] of [...this.restored]) {
      if (owner !== protocol) continue;
      this.restored.delete(id);
      if (stale(id)) dropped.push(id);
    }
    dropChats(dropped);
    return dropped;
  }
}

/** Messages being sent and notes to yourself come back from elsewhere. */
function newestKept(messages: readonly ChatMessage[]): ChatMessage[] {
  const kept: ChatMessage[] = [];
  for (let index = messages.length - 1; index >= 0 && kept.length < FIRST_PAGE; index--) {
    const message = messages[index];
    if (!message.id.startsWith("pending:") && !message.privateToMe) kept.push(message);
  }
  return kept.reverse();
}

function sameMessages(left: readonly ChatMessage[], right: readonly ChatMessage[]): boolean {
  return left.length === right.length && left.every((message, index) => message === right[index]);
}

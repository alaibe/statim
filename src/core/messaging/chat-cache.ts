import { dropChats } from './chat-store';
import type { MessageStore } from './message-store';
import type { ProtocolId } from './namespace';
import type { Chat, ChatId } from './types';

const SAVE_DELAY_MS = 2_000;

function lasting({
  typing: _typing,
  online: _online,
  lastSeenAt: _lastSeenAt,
  draft: _draft,
  ...rest
}: Chat): Chat {
  return rest;
}

/**
 * The chat list as each protocol last listed it in full, shown at launch
 * before any protocol connects. A protocol's chats are written only once it has
 * listed everything, and a restored chat its full listing lacks is dropped.
 */
export class ChatCache {
  private readonly written = new Map<ChatId, { source: Chat; json?: string }>();
  private readonly restored = new Map<ChatId, ProtocolId>();
  private readonly complete = new Set<ProtocolId>();
  private pending: readonly Chat[] | null = null;
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
    this.release(protocol, (id) => !present.has(id));
  }

  forget(protocol: ProtocolId): void {
    this.complete.delete(protocol);
    const drop = [...this.written]
      .filter(([, row]) => row.source.protocol === protocol)
      .map(([id]) => id);
    for (const id of drop) this.written.delete(id);
    if (drop.length > 0) {
      this.store
        .cacheChats([], drop)
        .catch((error) => console.warn('[chat] could not forget cached chats', error));
    }
    this.release(protocol, () => true);
  }

  pause(protocol: ProtocolId): void {
    this.complete.delete(protocol);
  }

  saveSoon(chats: readonly Chat[]): void {
    this.pending = chats;
    this.timer ??= setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
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
        .catch((error) => console.warn('[chat] could not keep the chat list', error));
    }
  }

  private release(protocol: ProtocolId, stale: (id: ChatId) => boolean): void {
    const dropped: ChatId[] = [];
    for (const [id, owner] of [...this.restored]) {
      if (owner !== protocol) continue;
      this.restored.delete(id);
      if (stale(id)) dropped.push(id);
    }
    dropChats(dropped);
  }
}

import type { AccountStorage } from '@/storage/account';
import { deferredWrite } from '@/storage/deferred-write';
import type { ChatId, MessageId } from './types';

declare const draftKeyBrand: unique symbol;
type DraftKey = string & { readonly [draftKeyBrand]: true };

export type Drafts = Record<DraftKey, string>;

const KEY = 'chat.drafts';

export async function loadDrafts(storage: AccountStorage): Promise<Drafts> {
  return (await storage.get<Drafts>(KEY)) ?? {};
}

export const { saveSoon: saveDraftsSoon, flush: flushDrafts } = deferredWrite<Drafts>(KEY, 400);

/** A thread keeps its own draft, on this device only. */
export function draftKey(id: ChatId, thread?: MessageId): DraftKey {
  return (thread ? `${id}#thread:${thread}` : id) as DraftKey;
}

export function withDraft(drafts: Drafts, key: DraftKey, text: string): Drafts {
  const next = { ...drafts };
  if (text) next[key] = text;
  else delete next[key];
  return next;
}

const PUSH_DELAY_MS = 1_500;

/**
 * What the protocol last had is remembered, so its echo of our own save changes
 * nothing and a draft typed elsewhere replaces ours only while ours is unchanged.
 */
export class DraftSync {
  private readonly remote = new Map<ChatId, string>();
  private readonly timers = new Map<ChatId, ReturnType<typeof setTimeout>>();

  typed(id: ChatId, text: string, push: (text: string) => Promise<void>): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        if ((this.remote.get(id) ?? '') === text) return;
        this.remote.set(id, text);
        push(text).catch((error) => console.warn('[chat] could not save the draft', error));
      }, PUSH_DELAY_MS)
    );
  }

  /** The draft to show now that the protocol reports `text`, if it should replace `local`. */
  received(id: ChatId, text: string, local: string): string | undefined {
    const last = this.remote.get(id);
    this.remote.set(id, text);
    if (last === text || local === text || this.timers.has(id)) return undefined;
    return local === (last ?? '') ? text : undefined;
  }

  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.remote.clear();
  }
}

export const draftSync = new DraftSync();

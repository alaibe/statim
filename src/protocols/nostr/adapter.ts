import type { DerivedKey } from '@/core/account/keyring';
import { PartialHistoryError } from '@/core/messaging/history';
import type { MessageStore, TransportChat } from '@/core/messaging/message-store';
import { protocolChatId } from '@/core/messaging/namespace';
import type { ChatSession } from '@/core/messaging/protocol';
import { StoreBackedSession } from '@/core/messaging/store-backed-session';
import type {
  ChatTransport,
  IncomingMessage,
  SendMeta,
  SendResult,
  TransportSink,
} from '@/core/messaging/transport';
import type {
  MessageContent,
  ParticipantId,
  SelfParticipant,
  ProtocolChatId,
} from '@/core/messaging/types';
import type { AccountStorage } from '@/storage/account';
import { npubFor, parsePublicKey } from '@/lib/bech32';
import {
  firstTagValue,
  nowSeconds,
  signEvent,
  tagValues,
  type NostrEvent,
  type Rumor,
} from './events';
import { keysFromDerivedKey, NOSTR_DERIVATION_PATH, type NostrKeys } from './keys';
import {
  chatIdFor,
  KIND_DELETION,
  KIND_DM,
  KIND_GIFT_WRAP,
  KIND_REACTION,
  participantsOf,
  unwrapGiftWrap,
  wrapForRecipients,
} from './nip17';
import { RelayPool, type WebSocketLike } from './relay-pool';

const NOSTR_PROTOCOL_ID = 'nostr';

/** How far back relays are asked to go when this device has no history yet. */
const HISTORY_WINDOW_SECONDS = 30 * 24 * 60 * 60;

/**
 * NIP-59 jitters a gift wrap's `created_at` backwards by up to two days to
 * blur when it was sent, so a filter starting exactly at the last seen rumor
 * misses wraps that were already in flight. Re-asking for a few days of
 * overlap is cheap; they dedupe on arrival.
 */
const JITTER_SLACK_SECONDS = 3 * 24 * 60 * 60;

interface NostrConnectOptions {
  derive(path: string): DerivedKey;
  relays: string[];
  createSocket?(url: string): WebSocketLike;
  store: MessageStore;
  /** Where the gift wraps already opened are remembered between runs. */
  storage?: AccountStorage;
}

/** NIP-25's like and dislike, drawn as the emoji the app reacts with. */
const REACTION_EMOJI = new Map([
  ['', '👍'],
  ['+', '👍'],
  ['-', '👎'],
]);

function messageOf(rumor: Rumor): Pick<IncomingMessage, 'content' | 'replyTo'> | null {
  const parents = tagValues(rumor, 'e');
  if (rumor.kind === KIND_REACTION) {
    const targetId = parents.at(-1);
    if (!targetId) return null;
    const emoji = REACTION_EMOJI.get(rumor.content) ?? rumor.content;
    return { content: { kind: 'reaction', targetId, emoji, action: 'added' } };
  }
  const replyTo =
    rumor.tags.find((tag) => tag[0] === 'e' && tag[3] === 'reply')?.[1] ?? parents.at(-1);
  return { content: { kind: 'text', text: rumor.content }, ...(replyTo ? { replyTo } : {}) };
}

function rumorFor(
  content: MessageContent,
  { replyTo, undoes }: SendMeta
): Pick<Rumor, 'kind' | 'content' | 'tags'> {
  if (content.kind === 'text') {
    return { kind: KIND_DM, content: content.text, tags: replyTo ? [['e', replyTo]] : [] };
  }
  if (content.kind === 'reaction' && content.action === 'added') {
    return {
      kind: KIND_REACTION,
      content: content.emoji,
      tags: [
        ['e', content.targetId],
        ['k', String(KIND_DM)],
      ],
    };
  }
  if (content.kind === 'reaction' && undoes) {
    return {
      kind: KIND_DELETION,
      content: '',
      tags: [
        ['e', undoes],
        ['k', String(KIND_REACTION)],
      ],
    };
  }
  throw new Error(`Nostr can only send text and reactions, not "${content.kind}"`);
}

const HANDLED_KEY = 'nostr.handledWraps';
const HANDLED_FOR_SECONDS = 7 * 24 * 60 * 60;

class HandledWraps {
  private timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly storage: AccountStorage,
    private readonly wraps: Map<string, number>
  ) {}

  static async load(storage: AccountStorage): Promise<HandledWraps> {
    const stored = (await storage.get<Record<string, number>>(HANDLED_KEY)) ?? {};
    return new HandledWraps(storage, new Map(Object.entries(stored)));
  }

  ids(): Iterable<string> {
    return this.wraps.keys();
  }

  add(event: NostrEvent): void {
    this.wraps.set(event.id, event.created_at);
    this.timer ??= setTimeout(() => this.save(), 1_000);
  }

  save(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const oldest = nowSeconds() - HANDLED_FOR_SECONDS;
    for (const [id, createdAt] of this.wraps) if (createdAt < oldest) this.wraps.delete(id);
    this.storage.set(HANDLED_KEY, Object.fromEntries(this.wraps)).catch(() => {});
  }
}

class NostrTransport implements ChatTransport {
  readonly protocolId = NOSTR_PROTOCOL_ID;
  readonly self: SelfParticipant;

  readonly rosterIsFixed = {
    onAdd:
      'Nostr groups have no roster to add to: the group is whoever a message is addressed to. ' +
      'Start a new group with everyone in it.',
    onRemove:
      'Nostr cannot remove anyone: nothing revokes access to messages already sent, ' +
      'and there is no roster to change.',
  };

  private sink: TransportSink | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly eosed = new Set<string>();
  private readonly historyWaiters = new Set<() => void>();
  private stopped = false;
  private retryHistory = false;
  private historyCursor: number | undefined;
  private deliveryError: unknown;
  private readonly deliveries = new Set<Promise<void>>();
  private readonly pendingSends = new Map<
    string,
    {
      key: string;
      rumor: Rumor;
      remaining: NostrEvent[];
    }
  >();

  constructor(
    readonly keys: NostrKeys,
    readonly pool: RelayPool,
    private readonly handled?: HandledWraps
  ) {
    this.self = { participantId: keys.publicKey, address: keys.npub };
  }

  attach(sink: TransportSink): void {
    this.sink = sink;
  }

  /**
   * One subscription for every chat: a gift wrap is addressed to a pubkey, not to a chat, so
   * there is no `openChat`.
   */
  listen(newestSeenAt?: number): void {
    this.historyCursor = newestSeenAt;
    this.eosed.clear();
    this.unsubscribe?.();
    this.unsubscribe = this.pool.subscribe({
      id: `inbox-${this.keys.publicKey.slice(0, 8)}`,
      filters: [
        {
          kinds: [KIND_GIFT_WRAP],
          '#p': [this.keys.publicKey],
          since: sinceFor(newestSeenAt),
        },
      ],
      onEvent: (event) => this.trackDelivery(event),
      onEose: (url) => {
        this.eosed.add(url);
        for (const check of this.historyWaiters) check();
      },
    });
  }

  private async ingest(event: NostrEvent): Promise<void> {
    const rumor = unwrapGiftWrap(event, this.keys);
    if (!rumor) {
      this.handled?.add(event);
      return;
    }

    const participants = participantsOf(rumor);
    const sent = {
      id: rumor.id,
      senderId: rumor.pubkey,
      sentAt: rumor.created_at * 1000,
      fromMe: rumor.pubkey === this.keys.publicKey,
      transportTimestamp: event.created_at * 1000,
    };
    try {
      if (rumor.kind === KIND_DELETION) {
        const undoes = firstTagValue(rumor, 'e');
        if (undoes) await this.sink?.withdraw(participants, { ...sent, undoes });
      } else {
        const message = messageOf(rumor);
        if (message) {
          await this.sink?.deliverToParticipants(
            participants,
            { ...sent, ...message },
            { title: firstTagValue(rumor, 'subject'), createdAt: rumor.created_at * 1000 }
          );
        }
      }
      this.handled?.add(event);
    } catch (error) {
      this.deliveryError = error;
      this.retryHistory = true;
      throw error;
    }
  }

  private trackDelivery(event: NostrEvent): Promise<void> {
    const delivery = this.ingest(event);
    this.deliveries.add(delivery);
    void delivery.finally(() => this.deliveries.delete(delivery)).catch(() => {});
    return delivery;
  }

  chatIdFor(participants: ParticipantId[]): ProtocolChatId {
    return protocolChatId(chatIdFor(participants));
  }

  async send(
    chat: TransportChat,
    content: MessageContent,
    meta: SendMeta = {}
  ): Promise<SendResult> {
    const rumor = rumorFor(content, meta);
    const key = JSON.stringify(rumor);
    const recipients = chat.participants.filter((p) => p !== this.keys.publicKey);

    let pending = this.pendingSends.get(chat.id);
    if (pending && pending.key !== key) {
      throw new Error(
        'Finish retrying the partially published Nostr message before sending another'
      );
    }
    if (!pending) {
      const wrapped = wrapForRecipients(this.keys, { recipients, subject: chat.title, ...rumor });
      pending = { key, rumor: wrapped.rumor, remaining: wrapped.wraps };
      this.pendingSends.set(chat.id, pending);
    }

    while (pending.remaining.length > 0) {
      await this.pool.publish(pending.remaining[0]);
      pending.remaining.shift();
    }
    const sent = pending.rumor;
    // Handed back at once rather than waiting for the self-addressed wrap to come back.
    return {
      id: sent.id,
      localMessage: {
        id: sent.id,
        senderId: sent.pubkey,
        sentAt: sent.created_at * 1000,
        content,
        ...(meta.replyTo ? { replyTo: meta.replyTo } : {}),
        fromMe: true,
      },
    };
  }

  confirmSend(chatId: ProtocolChatId, messageId: string): void {
    if (this.pendingSends.get(chatId)?.rumor.id === messageId) {
      this.pendingSends.delete(chatId);
    }
  }

  async resolveParticipant(addressOrId: string): Promise<ParticipantId | null> {
    return parsePublicKey(addressOrId);
  }

  async resolveAddresses(ids: ParticipantId[]): Promise<Record<ParticipantId, string>> {
    const out: Record<ParticipantId, string> = {};
    for (const id of ids) {
      const npub = npubFor(id);
      if (npub) out[id] = npub;
    }
    return out;
  }

  async sync(): Promise<void> {
    if (this.stopped) throw new Error('Nostr disconnected');
    if (this.retryHistory) {
      this.retryHistory = false;
      this.deliveryError = undefined;
      this.listen(this.historyCursor);
    }
    const urls = this.pool.states.map((relay) => relay.url);
    if (urls.length === 0) throw new Error('No Nostr relays configured');
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        this.historyWaiters.delete(check);
        if (error) {
          this.retryHistory = true;
          reject(error);
        } else resolve();
      };
      const check = () => {
        if (this.stopped) finish(new Error('Nostr disconnected'));
        else if (urls.every((url) => this.eosed.has(url))) finish();
      };
      const timer = setTimeout(() => {
        const completed = urls.filter((url) => this.eosed.has(url));
        const unavailable = urls.filter((url) => !this.eosed.has(url));
        finish(
          completed.length > 0
            ? new PartialHistoryError(
                `History fetched from ${completed.length} of ${urls.length} relays. Unavailable: ${unavailable.join(', ')}`
              )
            : new Error('Nostr history fetch timed out')
        );
      }, 15_000);
      this.historyWaiters.add(check);
      check();
    });
    await Promise.allSettled([...this.deliveries]);
    if (this.deliveryError) {
      const error = this.deliveryError;
      this.deliveryError = undefined;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.stopped = true;
    for (const check of this.historyWaiters) check();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pool.close();
    this.handled?.save();
  }
}

export class NostrSession extends StoreBackedSession implements ChatSession {
  private constructor(nostr: NostrTransport, store: MessageStore) {
    super(nostr, store);
    nostr.attach(this);
  }

  static async connect(options: NostrConnectOptions): Promise<NostrSession> {
    const keys = keysFromDerivedKey(options.derive(NOSTR_DERIVATION_PATH));
    const handled = options.storage ? await HandledWraps.load(options.storage) : undefined;
    const transport = new NostrTransport(
      keys,
      new RelayPool({
        urls: options.relays,
        handled: handled?.ids(),
        createSocket: options.createSocket,
        authenticate: (url, challenge) =>
          signEvent(
            {
              pubkey: keys.publicKey,
              created_at: nowSeconds(),
              kind: 22242,
              tags: [
                ['relay', url],
                ['challenge', challenge],
              ],
              content: '',
            },
            keys.secretKey
          ),
      }),
      handled
    );

    const session = new NostrSession(transport, options.store);
    await session.hydrate();
    transport.listen(await session.newestSeenAt(Date.now()));
    return session;
  }
}

function sinceFor(newestSeenAt?: number): number {
  if (newestSeenAt === undefined) {
    return nowSeconds() - HISTORY_WINDOW_SECONDS - JITTER_SLACK_SECONDS;
  }
  return Math.floor(newestSeenAt / 1000) - JITTER_SLACK_SECONDS;
}

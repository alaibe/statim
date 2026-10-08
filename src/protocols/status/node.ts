import { HttpError } from '@/core/errors';
import { base64ToBytes, bytesToBase64 } from '@/lib/bytes';
import { appFetch } from '@/lib/http';

import { STATUS_PUBSUB_TOPIC } from './topics';

export interface WakuMessage {
  payload: Uint8Array;
  contentTopic: string;
  /** Milliseconds, from the sender's clock. */
  timestamp?: number;
}

/** A message as nwaku's REST API carries it. */
export interface RestMessage {
  payload: string;
  contentTopic: string;
  version?: number;
  /** Nanoseconds. */
  timestamp?: number;
}

export interface HistoryOptions {
  /** Milliseconds. */
  startTime?: number;
  cursor?: string;
}

export interface WakuNode {
  info(): Promise<unknown>;
  subscribe(contentTopics: string[]): Promise<void>;
  poll(): Promise<WakuMessage[]>;
  publish(contentTopic: string, payload: Uint8Array): Promise<void>;
  history(
    contentTopics: string[],
    opts?: HistoryOptions
  ): Promise<{ messages: WakuMessage[]; cursor?: string }>;
  close?(): Promise<void>;
}

interface NodeOptions {
  nodeUrl: string;
  fetchImpl?: typeof fetch;
}

const TIMEOUT_MS = 15_000;
const PAGE_SIZE = 100;
const SHARD = encodeURIComponent(STATUS_PUBSUB_TOPIC);

function fromRest(message: RestMessage): WakuMessage {
  return {
    payload: base64ToBytes(message.payload),
    contentTopic: message.contentTopic,
    timestamp: message.timestamp ? Math.round(message.timestamp / 1_000_000) : undefined,
  };
}

/**
 * An nwaku node's REST API on the Status shard. Relay and store are asked by
 * pubsub topic: the Status network uses static sharding, so the `/auto/`
 * endpoints would derive a shard no Status client listens on.
 */
export class StatusNode implements WakuNode {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NodeOptions) {
    this.base = options.nodeUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(this.base)) {
      throw new Error('The Status node URL must start with http:// or https://');
    }
    this.fetchImpl = options.fetchImpl ?? appFetch;
  }

  async info(): Promise<unknown> {
    return this.request('GET', '/debug/v1/info');
  }

  /** Relay takes the whole shard, whatever the topics. */
  async subscribe(): Promise<void> {
    await this.request('POST', '/relay/v1/subscriptions', [STATUS_PUBSUB_TOPIC]);
  }

  /** What the node relayed on the shard since the last poll; the node forgets it once read. */
  async poll(): Promise<WakuMessage[]> {
    const body = await this.request('GET', `/relay/v1/messages/${SHARD}`);
    return Array.isArray(body) ? (body as RestMessage[]).map(fromRest) : [];
  }

  async publish(contentTopic: string, payload: Uint8Array): Promise<void> {
    const message: RestMessage = {
      payload: bytesToBase64(payload),
      contentTopic,
      version: 1,
      timestamp: Date.now() * 1_000_000,
    };
    await this.request('POST', `/relay/v1/messages/${SHARD}`, message);
  }

  async history(
    contentTopics: string[],
    opts: HistoryOptions = {}
  ): Promise<{ messages: WakuMessage[]; cursor?: string }> {
    const params = new URLSearchParams({
      pubsubTopic: STATUS_PUBSUB_TOPIC,
      contentTopics: contentTopics.join(','),
      pageSize: String(PAGE_SIZE),
      ascending: 'true',
      includeData: 'true',
    });
    if (opts.cursor) params.set('cursor', opts.cursor);
    if (opts.startTime !== undefined) {
      params.set('startTime', String(Math.floor(opts.startTime) * 1_000_000));
    }
    const body = (await this.request('GET', `/store/v3/messages?${params.toString()}`)) as {
      messages?: { message?: RestMessage }[];
      paginationCursor?: string;
    } | null;
    return {
      messages: (body?.messages ?? []).flatMap(({ message }) =>
        message?.payload ? [fromRest(message)] : []
      ),
      cursor: body?.paginationCursor,
    };
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(`${this.base}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!response.ok) {
        const detail = String((await response.text().catch(() => '')) ?? '').trim();
        throw new HttpError(
          response.status,
          `Your Status node returned ${response.status} for ${method} ${path.split('?')[0]}` +
            (detail ? `: ${detail.slice(0, 200)}` : '')
        );
      }
      const text = await response.text();
      if (!text) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return text;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Your Status node did not respond within ${TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

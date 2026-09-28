import type { RestMessage } from '../node';
import { STATUS_PUBSUB_TOPIC } from '../topics';

/** A shard every fake node relays on and archives, like a mesh with a store node in it. */
export class FakeStatusNetwork {
  readonly archive: RestMessage[] = [];
  private readonly nodes = new Set<FakeStatusNode>();

  node(): FakeStatusNode {
    const node = new FakeStatusNode(this);
    this.nodes.add(node);
    return node;
  }

  publish(message: RestMessage): void {
    this.archive.push(message);
    for (const node of this.nodes) node.relay(message);
  }
}

export class FakeStatusNode {
  subscribed = false;
  down = false;
  readonly published: RestMessage[] = [];
  readonly historyQueries: URL[] = [];
  private buffer: RestMessage[] = [];

  constructor(private readonly network: FakeStatusNetwork) {}

  relay(message: RestMessage): void {
    if (this.subscribed) this.buffer.push(message);
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const path = url.pathname;
    const shard = `/relay/v1/messages/${encodeURIComponent(STATUS_PUBSUB_TOPIC)}`;

    if (this.down) throw new TypeError('Network request failed');
    if (path === '/debug/v1/info') return json({ listenAddresses: [] });

    if (path === '/relay/v1/subscriptions') {
      const topics = JSON.parse(String(init?.body ?? '[]')) as string[];
      if (topics.includes(STATUS_PUBSUB_TOPIC)) this.subscribed = true;
      return json('OK');
    }

    if (path === shard) {
      if (method === 'POST') {
        const message = JSON.parse(String(init?.body ?? '{}')) as RestMessage;
        this.published.push(message);
        this.network.publish(message);
        return json('OK');
      }
      const drained = this.buffer;
      this.buffer = [];
      return json(drained);
    }

    if (path === '/store/v3/messages') {
      this.historyQueries.push(url);
      if (url.searchParams.get('pubsubTopic') !== STATUS_PUBSUB_TOPIC)
        return json({ messages: [] });
      const topics = (url.searchParams.get('contentTopics') ?? '').split(',');
      const startTime = Number(url.searchParams.get('startTime') ?? 0);
      const offset = Number(url.searchParams.get('cursor') ?? 0);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 100);
      const matching = this.network.archive.filter(
        (message) => topics.includes(message.contentTopic) && (message.timestamp ?? 0) >= startTime
      );
      const page = matching.slice(offset, offset + pageSize);
      const next = offset + page.length;
      return json({
        messages: page.map((message) => ({ message, pubsubTopic: STATUS_PUBSUB_TOPIC })),
        ...(next < matching.length ? { paginationCursor: String(next) } : {}),
      });
    }

    return new Response('not found', { status: 404 });
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

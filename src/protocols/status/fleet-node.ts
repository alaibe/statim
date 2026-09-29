import '@/polyfills/libp2p';

import {
  createLightNode,
  DecodedMessage,
  Decoder,
  Encoder,
  type IDecodedMessage,
  type IMessage,
  type IProtoMessage,
  type LightNode,
  Protocols,
} from '@waku/sdk';

import { fromHex, toHex } from '@/lib/bytes';

import type { HistoryOptions, WakuMessage, WakuNode } from './node';
import { STATUS_PUBSUB_TOPIC } from './topics';

/** status.prod's WebSocket entry points, as fleets.status.im lists them. */
const STATUS_FLEET = [
  '/dns4/boot-01.do-ams3.status.prod.status.im/tcp/443/wss/p2p/16Uiu2HAmAR24Mbb6VuzoyUiGx42UenDkshENVDj4qnmmbabLvo31',
  '/dns4/boot-01.gc-us-central1-a.status.prod.status.im/tcp/443/wss/p2p/16Uiu2HAm8mUZ18tBWPXDQsaF7PbCKYA35z7WB2xNZH2EVq1qS8LJ',
  '/dns4/boot-01.ac-cn-hongkong-c.status.prod.status.im/tcp/443/wss/p2p/16Uiu2HAmGwcE8v7gmJNEWFtZtojYpPMTHy2jBLL6xRk33qgDxFWX',
  '/dns4/store-01.do-ams3.status.prod.status.im/tcp/443/wss/p2p/16Uiu2HAmAUdrQ3uwzuE4Gy4D56hX6uLKEeerJAnhKEHZ3DxF1EfT',
  '/dns4/store-02.do-ams3.status.prod.status.im/tcp/443/wss/p2p/16Uiu2HAm9aDJPkhGxc2SFcEACTFdZ91Q5TJjp76qZEhq9iF59x7R',
  '/dns4/store-01.gc-us-central1-a.status.prod.status.im/tcp/443/wss/p2p/16Uiu2HAmMELCo218hncCtTvC2Dwbej3rbyHQcR8erXNnKGei7WPZ',
  '/dns4/store-02.gc-us-central1-a.status.prod.status.im/tcp/443/wss/p2p/16Uiu2HAmJnVR7ZzFaYvciPVafUXuYGLHPzSUigqAmeNw9nJUVGeM',
  '/dns4/store-01.ac-cn-hongkong-c.status.prod.status.im/tcp/443/wss/p2p/16Uiu2HAm2M7xs7cLPc3jamawkEqbr7cUJX11uvY7LxQ6WFUdUKUT',
  '/dns4/store-02.ac-cn-hongkong-c.status.prod.status.im/tcp/443/wss/p2p/16Uiu2HAm9CQhsuwPR54q27kNj9iaQVfyRzTGKrhFmr94oD8ujU6P',
];

const CONNECT_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 20;
const routingInfo = { clusterId: 16, shardId: 32, pubsubTopic: STATUS_PUBSUB_TOPIC };

class StatusEncoder extends Encoder {
  override async toProtoObj(message: IMessage): Promise<IProtoMessage> {
    return { ...(await super.toProtoObj(message)), version: 1 };
  }
}

/** Status apps send version 0 today and older ones 1; js-waku's own decoder drops anything but 0. */
class StatusDecoder extends Decoder {
  override async fromProtoObj(
    pubsubTopic: string,
    message: IProtoMessage
  ): Promise<IDecodedMessage> {
    return new DecodedMessage(
      pubsubTopic,
      message as ConstructorParameters<typeof DecodedMessage>[1]
    );
  }
}

const decoderFor = (contentTopic: string) => new StatusDecoder(contentTopic, routingInfo);

function wakuMessageOf(message: IDecodedMessage): WakuMessage {
  return {
    payload: message.payload,
    contentTopic: message.contentTopic,
    timestamp: message.timestamp?.getTime(),
  };
}

/** A Waku light client of Status's own nodes: filter for the inbox, lightpush to send, store for history. */
export class FleetNode implements WakuNode {
  private buffer: WakuMessage[] = [];
  private readonly subscribed = new Set<string>();

  private constructor(private readonly node: LightNode) {}

  static async connect(): Promise<FleetNode> {
    const node = await createLightNode({
      networkConfig: { clusterId: routingInfo.clusterId },
      defaultBootstrap: false,
      bootstrapPeers: STATUS_FLEET,
    });
    await node.start();
    try {
      await node.waitForPeers(
        [Protocols.Filter, Protocols.LightPush, Protocols.Store],
        CONNECT_TIMEOUT_MS
      );
    } catch {
      await node.stop();
      throw new Error('No Status node answered. Check the connection, or set a Status node URL.');
    }
    return new FleetNode(node);
  }

  async info(): Promise<unknown> {
    return { peers: this.node.libp2p.getPeers().length };
  }

  async subscribe(contentTopics: string[]): Promise<void> {
    const fresh = contentTopics.filter((topic) => !this.subscribed.has(topic));
    if (fresh.length === 0) return;
    const subscribed = await this.node.filter.subscribe(fresh.map(decoderFor), (message) => {
      this.buffer.push(wakuMessageOf(message));
    });
    if (!subscribed) throw new Error('No Status node took the subscription.');
    for (const topic of fresh) this.subscribed.add(topic);
  }

  async poll(): Promise<WakuMessage[]> {
    const drained = this.buffer;
    this.buffer = [];
    return drained;
  }

  async publish(contentTopic: string, payload: Uint8Array): Promise<void> {
    const encoder = new StatusEncoder(contentTopic, false, routingInfo);
    const result = await this.node.lightPush.send(encoder, { payload });
    if (result.successes.length === 0) {
      throw new Error(`No Status node took the message (${String(result.failures[0]?.error)}).`);
    }
  }

  /** A page per call; any page hands back a cursor, so the last one costs an empty query. */
  async history(
    contentTopics: string[],
    opts: HistoryOptions = {}
  ): Promise<{ messages: WakuMessage[]; cursor?: string }> {
    for (let pageSize = PAGE_SIZE; ; pageSize = Math.ceil(pageSize / 2)) {
      try {
        return await this.page(contentTopics, opts, pageSize);
      } catch (error) {
        const tooLong = error instanceof Error && error.name === 'InvalidDataLengthError';
        if (!tooLong || pageSize === 1) throw error;
      }
    }
  }

  /** libp2p refuses a reply over 4 MiB, and Status sends photos inline at up to 1 MiB, so a page may have to shrink. */
  private async page(
    contentTopics: string[],
    opts: HistoryOptions,
    pageSize: number
  ): Promise<{ messages: WakuMessage[]; cursor?: string }> {
    const pages = this.node.store.queryGenerator(contentTopics.map(decoderFor), {
      paginationForward: true,
      paginationLimit: pageSize,
      timeStart: opts.startTime === undefined ? undefined : new Date(opts.startTime),
      paginationCursor: opts.cursor ? fromHex(opts.cursor) : undefined,
    });
    for await (const page of pages) {
      const messages = (await Promise.all(page)).filter(
        (message): message is IDecodedMessage => message !== undefined
      );
      const last = messages.at(-1);
      return { messages: messages.map(wakuMessageOf), cursor: last && toHex(last.hash) };
    }
    return { messages: [] };
  }

  async close(): Promise<void> {
    await this.node.stop();
  }
}

import { bytesToNumberBE } from '@noble/curves/utils';
import { utf8ToBytes } from '@noble/hashes/utils';

import { toHex } from '@/lib/bytes';

import { keccak256 } from './crypto';

/** Cluster 16, shard 32: where status-go puts every DM and group message. */
export const STATUS_PUBSUB_TOPIC = '/waku/2/rs/16/32';

const PARTITIONS = 5000n;

export function contentTopic(name: string): string {
  return `/waku/1/0x${toHex(keccak256(utf8ToBytes(name)).subarray(0, 4))}/rfc26`;
}

export function partitionedTopic(publicKey: Uint8Array): string {
  const x = bytesToNumberBE(publicKey.subarray(1, 33));
  return contentTopic(`contact-discovery-${x % PARTITIONS}`);
}

export function personalTopic(publicKey: Uint8Array): string {
  return contentTopic(`contact-discovery-${toHex(publicKey)}`);
}

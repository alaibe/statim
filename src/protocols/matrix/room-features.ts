import type { ChatFeature } from '@/core/messaging/types';

import type { Homeserver } from './homeserver';

const SLIDING_SYNC = '/_matrix/client/unstable/org.matrix.simplified_msc3575';
const ROOM_FEATURES = 'com.beeper.room_features';
const PER_REQUEST = 100;

/**
 * What a mautrix bridge says its network can do in a room. A level runs from
 * -2 (rejected) to 2 (fully supported), and a level left out is 0.
 */
export interface RoomFeatures {
  edit?: number;
  delete?: number;
  poll?: number;
  thread?: number;
  reply?: number;
  reaction?: number;
  file?: Record<string, unknown>;
  state?: Record<string, { level?: number }>;
  member_actions?: Record<string, number>;
}

interface SyncResponse {
  rooms?: Record<string, { required_state?: { type: string; content?: RoomFeatures }[] }>;
}

const supported = (level: number | undefined) => (level ?? 0) > 0;

/** Member actions came to the event later, so a bridge that leaves them out says nothing about them. */
export function lacksOf(features: RoomFeatures): ChatFeature[] {
  const levels: [ChatFeature, number | undefined][] = [
    ['edit', features.edit],
    ['delete', features.delete],
    ['poll', features.poll],
    ['thread', features.thread],
    ['reply', features.reply],
    ['react', features.reaction],
    ['pin', features.state?.['m.room.pinned_events']?.level],
  ];
  const actions = features.member_actions;
  if (actions) {
    levels.push(['invite', actions.invite], ['remove', actions.kick], ['ban', actions.ban]);
  }
  return [
    ...levels.filter(([, level]) => !supported(level)).map(([feature]) => feature),
    ...(features.file?.['m.image'] ? [] : (['images'] as const)),
    ...(features.file?.['m.video'] ? [] : (['video'] as const)),
  ];
}

/**
 * Sliding sync leaves the event out of the room list, so bridged rooms are
 * asked about once, together, as they appear.
 */
export class RoomFeatureStore {
  private readonly known = new Map<string, readonly ChatFeature[] | null>();
  private batch: string[] | null = null;

  constructor(
    private readonly homeserver: () => Homeserver | null,
    private readonly onChange: (roomId: string) => void
  ) {}

  /** What the room's network lacks; undefined until its bridge has said. */
  lacks(roomId: string): readonly ChatFeature[] | undefined {
    const known = this.known.get(roomId);
    if (known === undefined) this.ask(roomId);
    return known ?? undefined;
  }

  clear(): void {
    this.known.clear();
    this.batch = null;
  }

  private ask(roomId: string): void {
    this.known.set(roomId, null);
    if (this.batch) {
      this.batch.push(roomId);
      return;
    }
    this.batch = [roomId];
    setTimeout(() => void this.load(), 0);
  }

  private async load(): Promise<void> {
    const roomIds = this.batch ?? [];
    this.batch = null;
    const homeserver = this.homeserver();
    if (!homeserver) {
      for (const roomId of roomIds) this.known.delete(roomId);
      return;
    }
    for (let at = 0; at < roomIds.length; at += PER_REQUEST) {
      const found = await fetchRoomFeatures(homeserver, roomIds.slice(at, at + PER_REQUEST)).catch(
        () => new Map<string, RoomFeatures>()
      );
      for (const [roomId, features] of found) {
        this.known.set(roomId, lacksOf(features));
        this.onChange(roomId);
      }
    }
  }
}

export async function fetchRoomFeatures(
  homeserver: Homeserver,
  roomIds: string[]
): Promise<Map<string, RoomFeatures>> {
  const subscription = { required_state: [[ROOM_FEATURES, '*']], timeline_limit: 0 };
  const response = await homeserver
    .at(SLIDING_SYNC)
    .request<SyncResponse>('POST', '/sync?timeout=0', {
      conn_id: 'statim-room-features',
      room_subscriptions: Object.fromEntries(roomIds.map((roomId) => [roomId, subscription])),
    });
  const found = new Map<string, RoomFeatures>();
  for (const [roomId, room] of Object.entries(response.rooms ?? {})) {
    const content = room.required_state?.find((event) => event.type === ROOM_FEATURES)?.content;
    if (content) found.set(roomId, content);
  }
  return found;
}

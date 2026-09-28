/**
 * A Status group is its signed event log: who created it, who was added or
 * removed and what it is called. Every member replays the log with these
 * rules, so an event a member could not have made is rejected everywhere.
 */
import { utf8ToBytes } from '@noble/hashes/utils';

import type { GroupRole, ParticipantId } from '@/core/messaging/types';
import { concat, toHex } from '@/lib/bytes';
import { randomBytes } from '@/lib/random';

import { keccak256, recoverPublicKey, sign } from './crypto';
import type { Keys } from './envelope';
import { participantIdOf } from './keys';
import { decodeGroupEvent, encodeGroupEvent, EventType, type WireGroupEvent } from './messages';

const SIGNATURE_LENGTH = 65;

export interface GroupEvent extends WireGroupEvent {
  from: ParticipantId;
  bytes: Uint8Array;
}

export function newGroupChatId(creator: ParticipantId): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = toHex(bytes);
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return `${uuid}-${creator}`;
}

export type GroupChange = Pick<WireGroupEvent, 'type'> & Partial<Omit<WireGroupEvent, 'clock'>>;

export function signGroupEvent(
  chatId: string,
  event: GroupChange & Pick<WireGroupEvent, 'clock'>,
  signer: Keys
): GroupEvent {
  const wire: WireGroupEvent = {
    members: [],
    name: '',
    color: '',
    ...event,
  };
  const raw = encodeGroupEvent(wire);
  const signature = sign(keccak256(utf8ToBytes(chatId), raw), signer.privateKey);
  return { ...wire, from: participantIdOf(signer.publicKey), bytes: concat([signature, raw]) };
}

/** Changes signed with consecutive clocks from `start`, the order every member replays them in. */
export function signGroupEvents(
  chatId: string,
  start: number,
  changes: GroupChange[],
  signer: Keys
): GroupEvent[] {
  return changes.map((change, index) =>
    signGroupEvent(chatId, { ...change, clock: start + index }, signer)
  );
}

export function readGroupEvent(chatId: string, bytes: Uint8Array): GroupEvent | null {
  if (bytes.length <= SIGNATURE_LENGTH) return null;
  const raw = bytes.subarray(SIGNATURE_LENGTH);
  const signer = recoverPublicKey(
    keccak256(utf8ToBytes(chatId), raw),
    bytes.subarray(0, SIGNATURE_LENGTH)
  );
  if (!signer) return null;
  try {
    return { ...decodeGroupEvent(raw), from: participantIdOf(signer), bytes };
  } catch {
    return null;
  }
}

function signatureOf(bytes: Uint8Array): string {
  return toHex(bytes.subarray(0, SIGNATURE_LENGTH));
}

export class GroupState {
  name = '';
  image?: Uint8Array;
  readonly members = new Set<ParticipantId>();
  readonly admins = new Set<ParticipantId>();
  private signatures?: Set<string>;

  private constructor(
    readonly chatId: string,
    readonly events: GroupEvent[]
  ) {}

  /** status-go's `NewGroupWithEvents`: null when any event breaks the rules. */
  static replay(chatId: string, events: GroupEvent[]): GroupState | null {
    const sorted = [...events].sort((a, b) => a.clock - b.clock);
    const group = new GroupState(chatId, sorted);
    for (const event of sorted) {
      if (!group.allows(event)) return null;
      group.apply(event);
    }
    const creator = group.creator;
    if (!creator || !chatId.endsWith(creator) || chatId === creator) return null;
    return group;
  }

  get creator(): ParticipantId | undefined {
    const first = this.events[0];
    return first?.type === EventType.CHAT_CREATED ? first.from : undefined;
  }

  get lastClock(): number {
    return this.events.at(-1)?.clock ?? 0;
  }

  roleOf(id: ParticipantId): GroupRole {
    if (this.creator === id) return 'owner';
    return this.admins.has(id) ? 'admin' : 'member';
  }

  /** Whether the log holds this signed event already, so its signature needs no checking again. */
  has(bytes: Uint8Array): boolean {
    this.signatures ??= new Set(this.events.map((event) => signatureOf(event.bytes)));
    return this.signatures.has(signatureOf(bytes));
  }

  wasEverMember(id: ParticipantId): boolean {
    return (
      this.creator === id ||
      this.events.some(
        (event) => event.type === EventType.MEMBERS_ADDED && event.members.includes(id)
      )
    );
  }

  merged(events: GroupEvent[]): GroupState | null {
    const added = events.filter((event) => !this.has(event.bytes));
    return added.length === 0 ? this : GroupState.replay(this.chatId, [...this.events, ...added]);
  }

  private allows(event: GroupEvent): boolean {
    const inside = this.admins.has(event.from) || this.members.has(event.from);
    switch (event.type) {
      case EventType.CHAT_CREATED:
        return this.admins.size === 0 && this.members.size === 0;
      case EventType.NAME_CHANGED:
        return inside && event.name.length > 0;
      case EventType.COLOR_CHANGED:
        return inside && event.color.length > 0;
      case EventType.IMAGE_CHANGED:
        return inside && (event.image?.length ?? 0) > 0;
      case EventType.MEMBERS_ADDED:
        return inside;
      case EventType.MEMBER_JOINED:
        return this.members.has(event.from);
      case EventType.MEMBER_REMOVED:
        return (
          event.members.length === 1 &&
          (event.from === event.members[0] ||
            (this.admins.has(event.from) && !this.admins.has(event.members[0])))
        );
      case EventType.ADMINS_ADDED:
        return (
          this.admins.has(event.from) && [...this.members].some((m) => event.members.includes(m))
        );
      case EventType.ADMIN_REMOVED:
        return (
          event.members.length === 1 &&
          this.admins.has(event.from) &&
          event.from === event.members[0]
        );
      default:
        return false;
    }
  }

  private apply(event: GroupEvent): void {
    switch (event.type) {
      case EventType.CHAT_CREATED:
        this.name = event.name;
        this.members.add(event.from);
        this.admins.add(event.from);
        break;
      case EventType.NAME_CHANGED:
        this.name = event.name;
        break;
      case EventType.IMAGE_CHANGED:
        this.image = event.image;
        break;
      case EventType.ADMINS_ADDED:
        for (const member of event.members) this.admins.add(member);
        break;
      case EventType.ADMIN_REMOVED:
        this.admins.delete(event.members[0]);
        break;
      case EventType.MEMBERS_ADDED:
        for (const member of event.members) this.members.add(member);
        break;
      case EventType.MEMBER_REMOVED:
        this.admins.delete(event.members[0]);
        this.members.delete(event.members[0]);
        break;
    }
  }
}

import {
  connectableProtocols as connectableOf,
  type ProtocolDescriptor,
} from '@/core/messaging/registry';
import { MATRIX_PROTOCOL } from './matrix/descriptor';
import { NOSTR_PROTOCOL } from './nostr/descriptor';
import { STATUS_PROTOCOL } from './status/descriptor';
import { TELEGRAM_PROTOCOL } from './telegram/descriptor';
import { XMTP_PROTOCOL } from './xmtp/descriptor';

export const PROTOCOLS = [
  XMTP_PROTOCOL,
  NOSTR_PROTOCOL,
  STATUS_PROTOCOL,
  TELEGRAM_PROTOCOL,
  MATRIX_PROTOCOL,
] as const;

export function protocolById(id: string): ProtocolDescriptor | undefined {
  return PROTOCOLS.find((protocol) => protocol.id === id);
}

export function connectableProtocols() {
  return connectableOf(PROTOCOLS);
}

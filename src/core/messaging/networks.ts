import { PROTOCOL_IDS, type ProtocolId } from './namespace';

export const BRIDGED_NETWORKS = {
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  messenger: 'Messenger',
  instagram: 'Instagram',
  slack: 'Slack',
  discord: 'Discord',
  googlemessages: 'Google Messages',
  imessage: 'iMessage',
  x: 'X',
  bluesky: 'Bluesky',
  linkedin: 'LinkedIn',
  googlechat: 'Google Chat',
  googlevoice: 'Google Voice',
} as const;

export type BridgedNetwork = keyof typeof BRIDGED_NETWORKS;

export type NetworkId = ProtocolId | BridgedNetwork;

export const NETWORK_IDS: readonly NetworkId[] = [
  ...PROTOCOL_IDS,
  ...(Object.keys(BRIDGED_NETWORKS) as BridgedNetwork[]),
];

export function isBridgedNetwork(network: NetworkId): network is BridgedNetwork {
  return network in BRIDGED_NETWORKS;
}

import type { IconName, RowIconTone } from '@/design';
import { connectionFor, type ProtocolConnection } from '@/core/messaging/chat-store';
import { LOCAL_PROTOCOL, type ProtocolId } from '@/core/messaging/namespace';
import { BRIDGED_NETWORKS, isBridgedNetwork, type NetworkId } from '@/core/messaging/networks';
import type { ChatProtocolMeta } from '@/core/messaging/protocol';
import type { ProtocolDescriptor } from '@/core/messaging/registry';
import { connectableProtocols, protocolById } from '@/protocols';

type ProtocolTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

export function toneFor(meta: ChatProtocolMeta): ProtocolTone {
  if (!meta.properties.endToEndEncrypted) return 'danger';
  if (meta.properties.groupModel === 'enforced' && meta.properties.forwardSecrecy) {
    return 'success';
  }
  return 'warning';
}

const ICON: Record<ProtocolId, { name: IconName; tone: RowIconTone }> = {
  xmtp: { name: 'shield-checkmark-outline', tone: 'blue' },
  nostr: { name: 'flash-outline', tone: 'purple' },
  status: { name: 'radio-outline', tone: 'teal' },
  telegram: { name: 'paper-plane-outline', tone: 'blue' },
  matrix: { name: 'grid-outline', tone: 'green' },
  local: { name: 'phone-portrait-outline', tone: 'grey' },
};

export function protocolIcon(protocol: ProtocolId): { name: IconName; tone: RowIconTone } {
  return ICON[protocol];
}

export function connectionBadge(
  descriptor: ProtocolDescriptor,
  connection: ProtocolConnection
): { label: string; tone: ProtocolTone } {
  if (!descriptor.connect) return { label: 'Not available', tone: 'neutral' };
  if (connection.login) return { label: 'Sign in', tone: 'warning' };

  switch (connection.status) {
    case 'ready':
      return connection.history.status === 'partial'
        ? { label: 'Incomplete', tone: 'warning' }
        : { label: 'Connected', tone: 'success' };
    case 'connecting':
      return { label: 'Connecting', tone: 'brand' };
    case 'error':
      return { label: 'Failed', tone: 'danger' };
    default:
      return { label: 'Not set up', tone: 'neutral' };
  }
}

export function protocolsNeedAttention(
  protocols: Partial<Record<ProtocolId, ProtocolConnection>>
): boolean {
  return connectableProtocols().some((descriptor) => {
    const { tone } = connectionBadge(descriptor, connectionFor(protocols, descriptor.id));
    return tone === 'warning' || tone === 'danger';
  });
}

export function protocolSubtitle(protocol: ProtocolId): string {
  if (protocol === LOCAL_PROTOCOL) return 'On this device only';

  const descriptor = protocolById(protocol);
  if (!descriptor) return 'Unknown protocol';

  const { properties } = descriptor.meta;
  if (!properties.endToEndEncrypted) return `${descriptor.label} · not end-to-end encrypted`;
  return `${descriptor.label} · end-to-end encrypted`;
}

export function describeProtocol(meta: ChatProtocolMeta): string {
  const { properties } = meta;
  const traits = [
    properties.endToEndEncrypted ? 'end-to-end encrypted' : 'NOT end-to-end encrypted',
    properties.forwardSecrecy ? 'forward secrecy' : 'no forward secrecy',
    `${properties.metadataPrivacy} metadata privacy`,
    GROUP_MODEL[properties.groupModel],
    properties.maxGroupSize === 'unbounded'
      ? 'unlimited group size'
      : `groups up to ${properties.maxGroupSize}`,
    properties.durableHistory ? 'history restores on a new device' : 'history stays on this device',
  ];
  return traits.join(' · ');
}

const GROUP_MODEL: Record<ChatProtocolMeta['properties']['groupModel'], string> = {
  enforced: 'enforced membership',
  'participant-set': 'membership is just who you address',
};

export function networkLabel(network: NetworkId): string {
  if (isBridgedNetwork(network)) return BRIDGED_NETWORKS[network];
  return protocolById(network)?.label ?? network;
}

import { useRouter } from 'expo-router';

import {
  Badge,
  Chevron,
  ListItem,
  RowIcon,
  Section,
  type IconName,
  type RowIconTone,
} from '@/design';
import { connectionFor, useChatStore, type ProtocolConnection } from '@/core/messaging/chat-store';
import type { ProtocolDescriptor } from '@/core/messaging/registry';
import { PROTOCOLS } from '@/protocols';
import { SettingsScreen } from '@/features/settings/settings-screen';

export default function ProtocolsScreen() {
  const router = useRouter();
  const connections = useChatStore((s) => s.protocols);

  return (
    <SettingsScreen
      title="Protocols"
      intro="Every configured protocol connects at once and shares one chat list. Each chat stays on the protocol it started on, and they do not offer the same guarantees.">
      <Section surface="card" className="mb-6">
        {PROTOCOLS.map((descriptor) => {
          const connection = connectionFor(connections, descriptor.id);
          const status = describeStatus(descriptor, connection);
          return (
            <ListItem
              key={descriptor.id}
              testID={`protocol-${descriptor.id}`}
              title={descriptor.label}
              subtitle={connection.error ?? descriptor.description}
              numberOfLinesSubtitle={2}
              leading={
                <RowIcon
                  name={ICON[descriptor.id] ?? 'git-network-outline'}
                  tone={TONE[descriptor.id] ?? 'grey'}
                />
              }
              meta={<Badge label={status.label} tone={status.tone} />}
              trailing={<Chevron />}
              onPress={() => router.push(`/settings/protocol/${descriptor.id}`)}
            />
          );
        })}
      </Section>
    </SettingsScreen>
  );
}

const TONE: Record<string, RowIconTone> = {
  xmtp: 'blue',
  nostr: 'purple',
  status: 'teal',
  telegram: 'blue',
  matrix: 'green',
};

const ICON: Record<string, IconName> = {
  xmtp: 'shield-checkmark-outline',
  nostr: 'flash-outline',
  status: 'radio-outline',
  telegram: 'paper-plane-outline',
  matrix: 'grid-outline',
};

function describeStatus(
  descriptor: ProtocolDescriptor,
  connection: ProtocolConnection
): { label: string; tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger' } {
  if (!descriptor.connect) return { label: 'Not available', tone: 'neutral' };
  if (connection.login) return { label: 'Sign in', tone: 'warning' };

  switch (connection.status) {
    case 'ready':
      return { label: 'Connected', tone: 'success' };
    case 'connecting':
      return { label: 'Connecting', tone: 'brand' };
    case 'error':
      return { label: 'Failed', tone: 'danger' };
    default:
      return { label: 'Not set up', tone: 'neutral' };
  }
}

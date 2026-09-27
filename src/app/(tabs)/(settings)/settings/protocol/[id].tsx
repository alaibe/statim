import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Badge, Button, Card, Note, Text } from '@/design';
import { useIdentityStore } from '@/core/identity/identity-store';
import { useChatStore } from '@/core/messaging/chat-store';
import { protocolById } from '@/protocols';
import { LoginStep, SignedIn } from '@/features/protocols/login';
import { MatrixBridges } from '@/features/protocols/matrix-bridges';
import type { ChatSession } from '@/core/messaging/protocol';
import type { MatrixCapabilities } from '@/protocols/matrix/provisioning';
import { describeProtocol, toneFor } from '@/features/protocols/presentation';
import { openExternal } from '@/lib/open-url';
import { SettingsScreen } from '@/features/settings/settings-screen';
import { ProtocolConfigForm } from '@/features/protocols/protocol-config-form';

export default function ProtocolConfigScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const descriptor = protocolById(id);
  const accountId = useIdentityStore((s) => s.activeAccountId);
  const connection = useChatStore((s) => (id ? s.protocols[id] : undefined));
  const session = useChatStore((s) => (id ? s.sessions[id] : undefined));

  if (!descriptor) {
    return (
      <SettingsScreen title="Protocol">
        <Text className="px-gutter">No protocol called “{id}”.</Text>
      </SettingsScreen>
    );
  }

  return (
    <SettingsScreen title={descriptor.label} intro={descriptor.description}>
      <View className="gap-3 px-gutter">
        <Card className="gap-2">
          <View className="flex-row items-start gap-2">
            <Badge
              label={descriptor.meta.properties.endToEndEncrypted ? 'Encrypted' : 'Not E2EE'}
              tone={toneFor(descriptor.meta)}
            />
            <Text variant="caption" className="flex-1">
              {descriptor.meta.trustModel}
            </Text>
          </View>
          <Text variant="micro">{describeProtocol(descriptor.meta)}</Text>
          {descriptor.docsUrl ? (
            <Button
              label={`How to set up ${descriptor.label}`}
              tone="neutral"
              size="sm"
              onPress={() => openExternal(descriptor.docsUrl!).catch(() => {})}
            />
          ) : null}
        </Card>

        {connection?.error ? (
          <Note tone="danger" title="Last connection failed">
            <Text variant="caption">{connection.error}</Text>
          </Note>
        ) : null}

        {connection?.login ? (
          <LoginStep
            key={connection.login.step}
            login={connection.login}
            session={session}
            label={descriptor.label}
          />
        ) : session?.subscribeLogin && session.self.address ? (
          <SignedIn session={session} label={descriptor.label} />
        ) : null}

        {id === 'matrix' && session?.self.address && !connection?.login ? (
          <MatrixBridges session={session as ChatSession & Partial<MatrixCapabilities>} />
        ) : null}

        {accountId ? <ProtocolConfigForm accountId={accountId} descriptor={descriptor} /> : null}
      </View>
    </SettingsScreen>
  );
}

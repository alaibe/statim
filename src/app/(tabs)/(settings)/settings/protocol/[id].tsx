import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, Field, Note, Text } from '@/design';
import { useIdentityStore } from '@/core/identity/identity-store';
import { useChatStore } from '@/core/messaging/chat-store';
import {
  loadProtocolConfig,
  missingFields,
  withDefaults,
  type ProtocolConfig,
} from '@/core/messaging/config';
import { protocolById } from '@/protocols';
import { LoginStep, SignedIn } from '@/features/protocols/login';
import { MatrixBridges } from '@/features/protocols/matrix-bridges';
import type { ChatSession } from '@/core/messaging/protocol';
import type { MatrixCapabilities } from '@/protocols/matrix/provisioning';
import { describeProtocol, toneFor } from '@/features/protocols/presentation';
import { accountRuntime } from '@/runtime';
import { openExternal } from '@/lib/open-url';
import { useAction } from '@/features/chat/use-action';
import { SettingsScreen } from '@/features/settings/settings-screen';

export default function ProtocolConfigScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const descriptor = protocolById(id);
  const accountId = useIdentityStore((s) => s.activeAccountId);
  const connection = useChatStore((s) => (id ? s.protocols[id] : undefined));
  const session = useChatStore((s) => (id ? s.sessions[id] : undefined));

  const [config, setConfig] = useState<ProtocolConfig | null>(null);

  useEffect(() => {
    if (!accountId || !descriptor) return;
    let cancelled = false;
    loadProtocolConfig(accountId, descriptor.id).then((stored) => {
      if (!cancelled) setConfig(withDefaults(descriptor.configSchema, stored));
    });
    return () => {
      cancelled = true;
    };
  }, [accountId, descriptor]);

  const save = useAction(
    async () => {
      if (!accountId || !config || !descriptor) return;
      await accountRuntime.updateProtocolConfig(accountId, descriptor.id, config);
    },
    { success: `${descriptor?.label} settings saved`, failure: 'Could not save those settings' }
  );

  if (!descriptor) {
    return (
      <SettingsScreen title="Protocol">
        <Text className="px-gutter">No protocol called “{id}”.</Text>
      </SettingsScreen>
    );
  }

  const missing = config ? missingFields(descriptor.configSchema, config) : [];

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

        {config === null ? (
          <Text variant="caption">Loading…</Text>
        ) : (
          descriptor.configSchema.fields.map((field) => (
            <Field
              key={field.key}
              testID={`protocol-field-${field.key}`}
              label={field.label}
              placeholder={field.placeholder}
              hint={field.help}
              defaultValue={config[field.key] ?? ''}
              onChangeText={(text) =>
                setConfig((current) => ({ ...(current ?? {}), [field.key]: text }))
              }
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              secureTextEntry={field.kind === 'secret'}
              multiline={field.kind === 'lines'}
              numberOfLines={field.kind === 'lines' ? 5 : 1}
              className={field.kind === 'lines' ? 'min-h-[110px]' : undefined}
            />
          ))
        )}

        {missing.length > 0 ? (
          <Text variant="caption">
            {`${descriptor.label} stays disconnected until ${missing
              .map((f) => f.label)
              .join(' and ')} ${missing.length === 1 ? 'is' : 'are'} filled in.`}
          </Text>
        ) : null}

        <Button
          testID="protocol-save"
          label="Save and reconnect"
          size="md"
          fullWidth
          loading={save.busy}
          disabled={config === null}
          onPress={() => save.run()}
        />
      </View>
    </SettingsScreen>
  );
}

import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useAccountStore } from "@/core/account/account-store";
import { connectionFor, useChatStore } from "@/core/messaging/chat-store";
import type { ChatSession } from "@/core/messaging/protocol";
import type { ProtocolDescriptor } from "@/core/messaging/registry";
import { Badge, Button, Card, Note, Text } from "@/design";
import { HistoryStatus } from "@/features/chat/history-status";
import { LoginStep, SignedIn } from "@/features/protocols/login";
import { MatrixBridges } from "@/features/protocols/matrix-bridges";
import { MatrixOnComputer } from "@/features/protocols/matrix-on-computer";
import { OwnAddress } from "@/features/protocols/own-address";
import { describeProtocol, toneFor } from "@/features/protocols/presentation";
import { ProtocolConfigForm } from "@/features/protocols/protocol-config-form";
import { SettingsScreen } from "@/features/settings/settings-screen";
import { openExternal } from "@/lib/open-url";
import { protocolById } from "@/protocols";
import type { MatrixCapabilities } from "@/protocols/matrix/provisioning";

export default function ProtocolConfigScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const descriptor = protocolById(id);

  if (!descriptor) {
    return (
      <SettingsScreen title="Protocol">
        <Text className="px-4">No protocol called “{id}”.</Text>
      </SettingsScreen>
    );
  }
  return <ProtocolSettings descriptor={descriptor} />;
}

function ProtocolSettings({ descriptor }: { descriptor: ProtocolDescriptor }) {
  const accountId = useAccountStore((s) => s.activeAccountId);
  const connection = useChatStore((s) => connectionFor(s.protocols, descriptor.id));
  const session = useChatStore((s): ChatSession | undefined => s.sessions[descriptor.id]);
  const [bridgesSeen, setBridgesSeen] = useState(0);
  const [configSaved, setConfigSaved] = useState(0);

  return (
    <SettingsScreen title={descriptor.label} intro={descriptor.description}>
      <HistoryStatus protocol={descriptor.id} />
      <View className="gap-3 px-4">
        <Card className="gap-2">
          <View className="flex-row items-start gap-2">
            <Badge
              label={descriptor.meta.properties.endToEndEncrypted ? "Encrypted" : "Not E2EE"}
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

        {descriptor.id === "matrix" && accountId ? (
          <MatrixOnComputer
            key={configSaved}
            accountId={accountId}
            signedIn={!!session?.self.address}
            signedOut={!!connection.login}
            onBridgesChanged={() => setBridgesSeen((n) => n + 1)}
          />
        ) : null}

        {connection.error ? (
          <Note tone="danger" title="Last connection failed">
            {connection.error}
          </Note>
        ) : null}

        {connection.login ? (
          <LoginStep key={connection.login.step} login={connection.login} session={session} label={descriptor.label} />
        ) : session?.self.address ? (
          <>
            {session.subscribeLogin ? (
              <SignedIn session={session} label={descriptor.label} />
            ) : (
              <OwnAddress
                label={descriptor.label}
                address={session.self.address}
                inboxId={descriptor.id === "xmtp" ? session.self.participantId : undefined}
              />
            )}
            {descriptor.id === "matrix" ? (
              <MatrixBridges key={bridgesSeen} session={session as ChatSession & Partial<MatrixCapabilities>} />
            ) : null}
          </>
        ) : null}

        {accountId ? (
          <ProtocolConfigForm
            accountId={accountId}
            descriptor={descriptor}
            onSaved={() => setConfigSaved((n) => n + 1)}
          />
        ) : null}
      </View>
    </SettingsScreen>
  );
}

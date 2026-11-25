import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useAccountStore } from "@/core/account/account-store";
import { connectionFor, useChatStore } from "@/core/messaging/chat-store";
import type { ChatSession } from "@/core/messaging/protocol";
import type { ProtocolDescriptor } from "@/core/messaging/registry";
import { Button, desktop, Notice, Section, Tag, Text } from "@/design";
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
        <View className="px-4">
          <Text tone="muted">No protocol called “{id}”.</Text>
        </View>
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
  const encrypted = descriptor.meta.properties.endToEndEncrypted;

  return (
    <SettingsScreen title={descriptor.label} intro={descriptor.description}>
      <HistoryStatus protocol={descriptor.id} />
      <View className="gap-6">
        <Section label="Security">
          <View className={desktop ? "gap-3 py-3" : "gap-3 p-4"}>
            <View className="flex-row items-start gap-2">
              <Tag tone={toneFor(descriptor.meta)} label={encrypted ? "E2EE" : "Not E2EE"} />
              <Text size="sm" style={{ flex: 1 }}>
                {descriptor.meta.trustModel}
              </Text>
            </View>
            <Text variant="meta">{describeProtocol(descriptor.meta)}</Text>
            {descriptor.docsUrl ? (
              <Button
                label={`How to set up ${descriptor.label}`}
                trailingIcon="arrow-up-right"
                size="sm"
                onPress={() => openExternal(descriptor.docsUrl!).catch(() => {})}
              />
            ) : null}
          </View>
        </Section>

        <View className="gap-4 px-4">
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
            <Notice tone="danger" message="The last connection failed." detail={connection.error} />
          ) : null}

          {connection.login ? (
            <LoginStep
              key={connection.login.step}
              login={connection.login}
              session={session}
              label={descriptor.label}
            />
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
              primary={!connection.login}
              onSaved={() => setConfigSaved((n) => n + 1)}
            />
          ) : null}
        </View>
      </View>
    </SettingsScreen>
  );
}

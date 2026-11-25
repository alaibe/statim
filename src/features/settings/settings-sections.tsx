import { useRouter } from "expo-router";
import { useState } from "react";
import { activeAccount, useAccountStore } from "@/core/account/account-store";
import { type Credentials, readCredentials } from "@/core/account/credentials";
import { eraseAccount } from "@/core/app/erase-account";
import { connectionFor, useChatStore } from "@/core/messaging/chat-store";
import { isProtocolId, type ProtocolId } from "@/core/messaging/namespace";
import type { ProtocolDescriptor } from "@/core/messaging/registry";
import { usePluginHost } from "@/core/plugins/host";
import { Badge, Chevron, ConfirmSheet, Icon, ListItem, RowIcon, Section } from "@/design";
import { openTab } from "@/features/navigation/open";
import { connectionBadge, protocolIcon } from "@/features/protocols/presentation";
import { notificationsHint } from "@/features/settings/notification-settings";
import { SecuritySection } from "@/features/settings/security-section";
import { useAction } from "@/features/use-action";
import { feedbackUrl } from "@/lib/feedback";
import { openExternal } from "@/lib/open-url";
import { useKeyedLoad } from "@/lib/use-keyed-load";
import { connectableProtocols } from "@/protocols";

const SETTINGS_PAGES = [
  "accounts",
  "recovery-phrase",
  "pin",
  "pin-off",
  "appearance",
  "notifications",
  "privacy",
  "trades",
  "gifs",
  "ai",
  "devices",
  "plugins",
  "command-line",
] as const;

type SettingsPage = (typeof SETTINGS_PAGES)[number] | `protocol/${ProtocolId}`;

export function settingsPageFor(segments: readonly string[], id: string | undefined): SettingsPage | undefined {
  if (segments.includes("protocol")) return id && isProtocolId(id) ? `protocol/${id}` : undefined;
  return segments.find((segment): segment is SettingsPage => (SETTINGS_PAGES as readonly string[]).includes(segment));
}

/** Reloaded whenever `revision` changes, which a screen ties to focus and the desktop sidebar to navigation. */
export function useSettingsKeys(revision: unknown): Credentials {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  return useKeyedLoad(activeAccountId, readCredentials, revision).value ?? NO_KEYS;
}

const NO_KEYS: Readonly<Credentials> = Object.freeze({});

function tradesHint(keys: Credentials): string {
  if (keys.lcx) return "Swaps compare LI.FI and LCX Liberty DEX";
  return keys.lifi ? "Swaps and bridges use your LI.FI key" : "Swap and bridge through LI.FI";
}

export function SettingsSections({
  keys,
  selected,
  compact = false,
}: {
  keys: Credentials;
  selected?: SettingsPage;
  /** Titles only, for a narrow column. */
  compact?: boolean;
}) {
  const router = useRouter();
  const chevron = compact ? undefined : <Chevron />;
  const external = compact ? undefined : <Icon name="arrow-up-right" size={20} tone="subtle" />;
  const hint = (text: string) => (compact ? undefined : text);
  const accounts = useAccountStore((s) => s.accounts);
  const onWallet = useAccountStore((s) => activeAccount(s)?.kind === "hardware");
  const { enabledIds, registry } = usePluginHost();

  const [confirmErase, setConfirmErase] = useState(false);
  const erase = useAction(() => eraseAccount(), { failure: "Could not erase that account" });

  return (
    <>
      <Section title="Account" surface="card" className="mb-6">
        <ListItem
          testID="settings-accounts"
          title="Accounts"
          subtitle={
            compact
              ? undefined
              : accounts.length === 1
                ? "Add another account or switch between them"
                : `${accounts.length} accounts on this device`
          }
          leading={<RowIcon name="users" />}
          trailing={chevron}
          selected={selected === "accounts"}
          onPress={() => openTab("/accounts")}
        />
        <ListItem
          testID="settings-qr-row"
          title="My QR code"
          subtitle={hint("Let someone scan your address to start a chat")}
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="qr-code" />}
          trailing={chevron}
          onPress={() => router.push("/qr")}
        />
        {onWallet ? null : (
          <ListItem
            testID="settings-recovery-phrase"
            title="Recovery phrase"
            subtitle={hint("View the words that control this account")}
            numberOfLinesSubtitle={2}
            leading={<RowIcon name="key-round" />}
            trailing={chevron}
            selected={selected === "recovery-phrase"}
            onPress={() => openTab("/settings/recovery-phrase")}
          />
        )}
        <ListItem
          testID="settings-erase-account"
          title="Erase this account"
          subtitle={hint(
            onWallet
              ? "Removes every message kept here. Connecting the wallet again brings the account back."
              : "Removes its keys and every message kept here. Only the recovery phrase brings it back.",
          )}
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="trash-2" danger />}
          onPress={() => setConfirmErase(true)}
        />
      </Section>

      <Section title="Messaging" surface="card" className="mb-6">
        {connectableProtocols().map((descriptor) => (
          <ProtocolRow
            key={descriptor.id}
            descriptor={descriptor}
            compact={compact}
            selected={selected === `protocol/${descriptor.id}`}
          />
        ))}
      </Section>

      <SecuritySection compact={compact} pinSelected={selected === "pin"} pinOffSelected={selected === "pin-off"} />

      <Section title="Preferences" surface="card" className="mb-6">
        <ListItem
          testID="settings-appearance"
          title="Appearance"
          subtitle={hint("Theme and chat wallpaper")}
          leading={<RowIcon name="palette" />}
          trailing={chevron}
          selected={selected === "appearance"}
          onPress={() => openTab("/settings/appearance")}
        />
        {notificationsHint ? (
          <ListItem
            testID="settings-notifications"
            title="Notifications"
            subtitle={hint(notificationsHint)}
            leading={<RowIcon name="bell" />}
            trailing={chevron}
            selected={selected === "notifications"}
            onPress={() => openTab("/settings/notifications")}
          />
        ) : null}
        <ListItem
          testID="settings-privacy"
          title="Privacy"
          subtitle={hint("Read receipts, and what this app deliberately does not collect")}
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="hand" />}
          trailing={chevron}
          selected={selected === "privacy"}
          onPress={() => openTab("/settings/privacy")}
        />
        <ListItem
          testID="settings-trades"
          title="Trades"
          subtitle={hint(tradesHint(keys))}
          leading={<RowIcon name="arrow-left-right" />}
          trailing={chevron}
          selected={selected === "trades"}
          onPress={() => openTab("/settings/trades")}
        />
        <ListItem
          testID="settings-gifs"
          title="GIFs"
          subtitle={hint(keys.gifs ? "Search is on" : "Add a KLIPY key to search GIFs")}
          leading={<RowIcon name="smile" />}
          trailing={chevron}
          selected={selected === "gifs"}
          onPress={() => openTab("/settings/gifs")}
        />
        <ListItem
          testID="settings-ai"
          title="AI"
          subtitle={hint("The model that rewrites, translates and summarises")}
          leading={<RowIcon name="sparkles" />}
          trailing={chevron}
          selected={selected === "ai"}
          onPress={() => openTab("/settings/ai")}
        />
        <ListItem
          testID="settings-devices"
          title="Devices"
          subtitle={hint("Where this account is signed in")}
          leading={<RowIcon name="smartphone" />}
          trailing={chevron}
          selected={selected === "devices"}
          onPress={() => openTab("/settings/devices")}
        />
      </Section>

      <Section
        title={process.env.EXPO_OS === "web" ? "Plugins and command line" : "Plugins"}
        surface="card"
        className="mb-6"
      >
        <ListItem
          testID="settings-plugins"
          title="Plugins"
          subtitle={hint(`${enabledIds.length} of ${registry.list().length} enabled`)}
          leading={<RowIcon name="puzzle" />}
          trailing={chevron}
          selected={selected === "plugins"}
          onPress={() => openTab("/settings/plugins")}
        />
        {process.env.EXPO_OS === "web" ? (
          <ListItem
            testID="settings-command-line"
            title="Command line"
            subtitle={hint("Use this app from a terminal, or let an AI agent use it")}
            leading={<RowIcon name="terminal" />}
            trailing={chevron}
            selected={selected === "command-line"}
            onPress={() => openTab("/settings/command-line")}
          />
        ) : null}
      </Section>

      <Section title="Feedback" surface="card" className="mb-6">
        <ListItem
          testID="settings-report-problem"
          title="Report a problem"
          subtitle={hint("Opens a public issue form on GitHub")}
          leading={<RowIcon name="flag" />}
          trailing={external}
          onPress={() => openExternal(feedbackUrl("problem")).catch(() => {})}
        />
        <ListItem
          testID="settings-suggest-feature"
          title="Suggest a feature"
          subtitle={hint("Opens a public issue form on GitHub")}
          leading={<RowIcon name="lightbulb" />}
          trailing={external}
          onPress={() => openExternal(feedbackUrl("feature")).catch(() => {})}
        />
      </Section>

      <ConfirmSheet
        visible={confirmErase}
        onClose={() => setConfirmErase(false)}
        title="Erase this account?"
        body="This erases the keys and every message stored on this device. Nothing is kept, and nobody can send it back to you. The only way to return is the recovery phrase."
        confirm={{
          testID: "confirm-erase-account",
          label: "Erase account",
          tone: "danger",
          onPress: async () => {
            if (await erase.run()) setConfirmErase(false);
          },
        }}
      />
    </>
  );
}

function ProtocolRow({
  descriptor,
  compact,
  selected,
}: {
  descriptor: ProtocolDescriptor;
  compact: boolean;
  selected: boolean;
}) {
  const connection = useChatStore((s) => connectionFor(s.protocols, descriptor.id));
  const address = useChatStore((s) => s.sessions[descriptor.id]?.self.address);
  const badge = connectionBadge(descriptor, connection);

  return (
    <ListItem
      testID={`settings-protocol-${descriptor.id}`}
      title={descriptor.label}
      subtitle={compact ? undefined : (connection.error ?? (address || descriptor.description))}
      leading={<RowIcon {...protocolIcon(descriptor.id)} />}
      meta={<Badge label={badge.label} tone={badge.tone} />}
      trailing={compact ? undefined : <Chevron />}
      selected={selected}
      onPress={() => openTab(`/settings/protocol/${descriptor.id}`)}
    />
  );
}

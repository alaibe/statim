import { useRouter } from "expo-router";
import { useState } from "react";
import { activeAccount, useAccountStore } from "@/core/account/account-store";
import { type Credentials, readCredentials } from "@/core/account/credentials";
import { eraseAccount } from "@/core/app/erase-account";
import { connectionFor, useChatStore } from "@/core/messaging/chat-store";
import { isProtocolId, type ProtocolId } from "@/core/messaging/namespace";
import type { ProtocolDescriptor } from "@/core/messaging/registry";
import { usePluginHost } from "@/core/plugins/host";
import { ConfirmDialog } from "@/design";
import { openTab } from "@/features/navigation/open";
import { connectionBadge, protocolIcon } from "@/features/protocols/presentation";
import { notificationsHint } from "@/features/settings/notification-settings";
import { SecuritySection } from "@/features/settings/security-section";
import { PageLink, SettingsGroup } from "@/features/settings/settings-group";
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
  const hint = (text: string) => (compact ? undefined : text);
  const accounts = useAccountStore((s) => s.accounts);
  const onWallet = useAccountStore((s) => activeAccount(s)?.kind === "hardware");
  const { enabledIds, registry } = usePluginHost();

  const [confirmErase, setConfirmErase] = useState(false);
  const erase = useAction(() => eraseAccount(), { failure: "Couldn't erase that account" });
  const link = { compact };

  return (
    <>
      <SettingsGroup label="Account" compact={compact}>
        <PageLink
          {...link}
          testID="settings-accounts"
          label="Accounts"
          description={
            accounts.length === 1
              ? "Add another account or switch between them"
              : `${accounts.length} accounts on this device`
          }
          icon="users"
          selected={selected === "accounts"}
          onPress={() => openTab("/accounts")}
        />
        <PageLink
          {...link}
          testID="settings-qr-row"
          label="My QR code"
          description="Let someone scan your address to start a chat"
          icon="qr-code"
          onPress={() => router.push("/qr")}
        />
        {onWallet ? null : (
          <PageLink
            {...link}
            testID="settings-recovery-phrase"
            label="Recovery phrase"
            description="View the words that control this account"
            icon="key-round"
            selected={selected === "recovery-phrase"}
            onPress={() => openTab("/settings/recovery-phrase")}
          />
        )}
      </SettingsGroup>

      <SettingsGroup label="Messaging" compact={compact}>
        {connectableProtocols().map((descriptor) => (
          <ProtocolRow
            key={descriptor.id}
            descriptor={descriptor}
            compact={compact}
            selected={selected === `protocol/${descriptor.id}`}
          />
        ))}
      </SettingsGroup>

      <SecuritySection compact={compact} pinSelected={selected === "pin"} pinOffSelected={selected === "pin-off"} />

      <SettingsGroup label="Preferences" compact={compact}>
        <PageLink
          {...link}
          testID="settings-appearance"
          label="Appearance"
          description={hint(process.env.EXPO_OS === "web" ? "Theme and quick tips" : "Theme")}
          icon="palette"
          selected={selected === "appearance"}
          onPress={() => openTab("/settings/appearance")}
        />
        {notificationsHint ? (
          <PageLink
            {...link}
            testID="settings-notifications"
            label="Notifications"
            description={notificationsHint}
            icon="bell"
            selected={selected === "notifications"}
            onPress={() => openTab("/settings/notifications")}
          />
        ) : null}
        <PageLink
          {...link}
          testID="settings-privacy"
          label="Privacy"
          description="Read receipts, and what this app deliberately doesn't collect"
          icon="hand"
          selected={selected === "privacy"}
          onPress={() => openTab("/settings/privacy")}
        />
        <PageLink
          {...link}
          testID="settings-trades"
          label="Trades"
          description={tradesHint(keys)}
          icon="arrow-left-right"
          selected={selected === "trades"}
          onPress={() => openTab("/settings/trades")}
        />
        <PageLink
          {...link}
          testID="settings-gifs"
          label="GIFs"
          description={keys.gifs ? "Search is on" : "Add a KLIPY key to search GIFs"}
          icon="smile"
          selected={selected === "gifs"}
          onPress={() => openTab("/settings/gifs")}
        />
        <PageLink
          {...link}
          testID="settings-ai"
          label="AI"
          description="The model that rewrites, translates and summarises"
          icon="sparkles"
          selected={selected === "ai"}
          onPress={() => openTab("/settings/ai")}
        />
        <PageLink
          {...link}
          testID="settings-devices"
          label="Devices"
          description="Where this account is signed in"
          icon="smartphone"
          selected={selected === "devices"}
          onPress={() => openTab("/settings/devices")}
        />
      </SettingsGroup>

      <SettingsGroup label={process.env.EXPO_OS === "web" ? "Plugins and command line" : "Plugins"} compact={compact}>
        <PageLink
          {...link}
          testID="settings-plugins"
          label="Plugins"
          description={`${enabledIds.length} of ${registry.list().length} enabled`}
          icon="puzzle"
          selected={selected === "plugins"}
          onPress={() => openTab("/settings/plugins")}
        />
        {process.env.EXPO_OS === "web" ? (
          <PageLink
            {...link}
            testID="settings-command-line"
            label="Command line"
            description="Use this app from a terminal, or let an AI agent use it"
            icon="terminal"
            selected={selected === "command-line"}
            onPress={() => openTab("/settings/command-line")}
          />
        ) : null}
      </SettingsGroup>

      <SettingsGroup label="Feedback" compact={compact}>
        <PageLink
          {...link}
          testID="settings-report-problem"
          label="Report a problem"
          description="Opens a public issue form on GitHub"
          icon="flag"
          external
          onPress={() => openExternal(feedbackUrl("problem")).catch(() => {})}
        />
        <PageLink
          {...link}
          testID="settings-suggest-feature"
          label="Suggest a feature"
          description="Opens a public issue form on GitHub"
          icon="lightbulb"
          external
          onPress={() => openExternal(feedbackUrl("feature")).catch(() => {})}
        />
      </SettingsGroup>

      <SettingsGroup label="Danger zone" compact={compact} danger>
        <PageLink
          {...link}
          testID="settings-erase-account"
          label="Erase this account…"
          description={
            onWallet
              ? "Removes every message kept here. Connecting the wallet again brings the account back."
              : "Removes its keys and every message kept here. Only the recovery phrase brings it back."
          }
          icon="trash-2"
          danger
          onPress={() => setConfirmErase(true)}
        />
      </SettingsGroup>

      <ConfirmDialog
        visible={confirmErase}
        onClose={() => setConfirmErase(false)}
        label="Erase account"
        title="Erase this account?"
        body="This erases the keys and every message stored on this device. Nothing is kept, and nobody can send it back to you. The only way to return is the recovery phrase."
        confirm={{
          testID: "confirm-erase-account",
          label: "Erase account",
          danger: true,
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
    <PageLink
      compact={compact}
      testID={`settings-protocol-${descriptor.id}`}
      label={descriptor.label}
      description={connection.error ?? badge.detail ?? (address || descriptor.description)}
      icon={protocolIcon(descriptor.id).name}
      tag={badge}
      selected={selected}
      onPress={() => openTab(`/settings/protocol/${descriptor.id}`)}
    />
  );
}

import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Badge, Chevron, ConfirmSheet, ListItem, RowIcon, Section } from '@/design';
import { useAccountStore } from '@/core/account/account-store';
import { readCredentials, type Credentials } from '@/core/account/credentials';
import { connectionFor, useChatStore } from '@/core/messaging/chat-store';
import { isProtocolId, type ProtocolId } from '@/core/messaging/namespace';
import type { ProtocolDescriptor } from '@/core/messaging/registry';
import { connectableProtocols } from '@/protocols';
import { eraseAccount } from '@/core/app/erase-account';
import { usePluginHost } from '@/core/plugins/host';
import { openTab } from '@/features/navigation/open';
import { connectionBadge, protocolIcon } from '@/features/protocols/presentation';
import { SecuritySection } from '@/features/settings/security-section';
import { useKeyedLoad } from '@/lib/use-keyed-load';
import { useAction } from '@/features/use-action';

const SETTINGS_PAGES = [
  'accounts',
  'recovery-phrase',
  'pin',
  'pin-off',
  'appearance',
  'notifications',
  'privacy',
  'trades',
  'gifs',
  'ai',
  'devices',
  'plugins',
  'command-line',
] as const;

/** The pages the sections open, so a layout showing both can mark the open one. */
export type SettingsPage = (typeof SETTINGS_PAGES)[number] | `protocol/${ProtocolId}`;

export function settingsPageFor(
  segments: readonly string[],
  id: string | undefined
): SettingsPage | undefined {
  if (segments.includes('protocol')) return id && isProtocolId(id) ? `protocol/${id}` : undefined;
  return segments.find((segment): segment is SettingsPage =>
    (SETTINGS_PAGES as readonly string[]).includes(segment)
  );
}

/**
 * Which optional keys the account has. Reloaded whenever `revision` changes,
 * which a screen ties to focus and the desktop sidebar to navigation.
 */
export function useSettingsKeys(revision: unknown): Credentials {
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  return useKeyedLoad(activeAccountId, readCredentials, revision).value ?? NO_KEYS;
}

const NO_KEYS: Readonly<Credentials> = Object.freeze({});

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
  const hint = (text: string) => (compact ? undefined : text);
  const accounts = useAccountStore((s) => s.accounts);
  const { enabledIds, registry } = usePluginHost();

  const [confirmErase, setConfirmErase] = useState(false);
  const erase = useAction(() => eraseAccount(), { failure: 'Could not erase that account' });

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
                ? 'Add another account or switch between them'
                : `${accounts.length} accounts on this device`
          }
          leading={<RowIcon name="people-outline" tone="blue" />}
          trailing={chevron}
          selected={selected === 'accounts'}
          onPress={() => openTab('/accounts')}
        />
        <ListItem
          testID="settings-qr-row"
          title="My QR code"
          subtitle={hint('Let someone scan your address to start a chat')}
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="qr-code-outline" tone="purple" />}
          trailing={chevron}
          onPress={() => router.push('/qr')}
        />
        <ListItem
          testID="settings-recovery-phrase"
          title="Recovery phrase"
          subtitle={hint('View the words that control this account')}
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="key-outline" tone="orange" />}
          trailing={chevron}
          selected={selected === 'recovery-phrase'}
          onPress={() => openTab('/settings/recovery-phrase')}
        />
        <ListItem
          testID="settings-erase-account"
          title="Erase this account"
          subtitle={hint(
            'Removes its keys and every message kept here. Only the recovery phrase brings it back.'
          )}
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="trash-outline" tone="red" />}
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

      <SecuritySection
        compact={compact}
        pinSelected={selected === 'pin'}
        pinOffSelected={selected === 'pin-off'}
      />

      <Section title="Preferences" surface="card" className="mb-6">
        <ListItem
          testID="settings-appearance"
          title="Appearance"
          subtitle={hint('Theme and chat wallpaper')}
          leading={<RowIcon name="color-palette-outline" tone="pink" />}
          trailing={chevron}
          selected={selected === 'appearance'}
          onPress={() => openTab('/settings/appearance')}
        />
        {process.env.EXPO_OS === 'web' ? (
          <ListItem
            testID="settings-notifications"
            title="Notifications"
            subtitle={hint('Open at login')}
            leading={<RowIcon name="notifications-outline" tone="red" />}
            trailing={chevron}
            selected={selected === 'notifications'}
            onPress={() => openTab('/settings/notifications')}
          />
        ) : null}
        <ListItem
          testID="settings-privacy"
          title="Privacy"
          subtitle={hint('Read receipts, and what this app deliberately does not collect')}
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="hand-left-outline" tone="grey" />}
          trailing={chevron}
          selected={selected === 'privacy'}
          onPress={() => openTab('/settings/privacy')}
        />
        <ListItem
          testID="settings-trades"
          title="Trades"
          subtitle={hint(
            keys.trades ? 'Swaps and bridges use your LI.FI key' : 'Swap and bridge through LI.FI'
          )}
          leading={<RowIcon name="swap-horizontal-outline" tone="blue" />}
          trailing={chevron}
          selected={selected === 'trades'}
          onPress={() => openTab('/settings/trades')}
        />
        <ListItem
          testID="settings-gifs"
          title="GIFs"
          subtitle={hint(keys.gifs ? 'Search is on' : 'Add a KLIPY key to search GIFs')}
          leading={<RowIcon name="happy-outline" tone="green" />}
          trailing={chevron}
          selected={selected === 'gifs'}
          onPress={() => openTab('/settings/gifs')}
        />
        <ListItem
          testID="settings-ai"
          title="AI"
          subtitle={hint('The model that rewrites, translates and summarises')}
          leading={<RowIcon name="sparkles-outline" tone="teal" />}
          trailing={chevron}
          selected={selected === 'ai'}
          onPress={() => openTab('/settings/ai')}
        />
        <ListItem
          testID="settings-devices"
          title="Devices"
          subtitle={hint('Where this account is signed in')}
          leading={<RowIcon name="phone-portrait-outline" tone="orange" />}
          trailing={chevron}
          selected={selected === 'devices'}
          onPress={() => openTab('/settings/devices')}
        />
      </Section>

      <Section
        title={process.env.EXPO_OS === 'web' ? 'Plugins and command line' : 'Plugins'}
        surface="card"
        className="mb-6">
        <ListItem
          testID="settings-plugins"
          title="Plugins"
          subtitle={hint(`${enabledIds.length} of ${registry.list().length} enabled`)}
          leading={<RowIcon name="extension-puzzle-outline" tone="purple" />}
          trailing={chevron}
          selected={selected === 'plugins'}
          onPress={() => openTab('/settings/plugins')}
        />
        {process.env.EXPO_OS === 'web' ? (
          <ListItem
            testID="settings-command-line"
            title="Command line"
            subtitle={hint('Use this app from a terminal, or let an AI agent use it')}
            leading={<RowIcon name="terminal-outline" tone="grey" />}
            trailing={chevron}
            selected={selected === 'command-line'}
            onPress={() => openTab('/settings/command-line')}
          />
        ) : null}
      </Section>

      <ConfirmSheet
        visible={confirmErase}
        onClose={() => setConfirmErase(false)}
        title="Erase this account?"
        body="This erases the keys and every message stored on this device. Nothing is kept, and nobody can send it back to you. The only way to return is the recovery phrase."
        confirm={{
          testID: 'confirm-erase-account',
          label: 'Erase account',
          tone: 'danger',
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

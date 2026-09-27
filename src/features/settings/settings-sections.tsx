import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Chevron, ConfirmSheet, ListItem, RowIcon, Section } from '@/design';
import { useAccountStore } from '@/core/account/account-store';
import { readCredentials, type Credentials } from '@/core/account/credentials';
import {
  connectionFor,
  type ProtocolConnection,
  useChatStore,
  xmtpSessionFor,
} from '@/core/messaging/chat-store';
import { connectableProtocols } from '@/protocols';
import { xmtpEnvironment } from '@/protocols/xmtp/shared';
import { eraseAccount } from '@/core/app/erase-account';
import { usePluginHost } from '@/core/plugins/host';
import { BiometricSection } from '@/features/settings/biometric-section';
import { openTab } from '@/features/navigation/open';
import { useKeyedLoad } from '@/lib/use-keyed-load';
import { useAction } from '@/features/use-action';

/** The routes the sections open, so a layout showing both can mark the open one. */
export const SETTINGS_PAGES = [
  'accounts',
  'recovery-phrase',
  'appearance',
  'privacy',
  'trades',
  'gifs',
  'devices',
  'plugins',
  'protocols',
  'command-line',
] as const;

export type SettingsPage = (typeof SETTINGS_PAGES)[number];

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
  const xmtp = useChatStore(xmtpSessionFor);
  const protocols = useChatStore((s) => s.protocols);
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

      <BiometricSection />

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

      <Section title="Messaging" surface="card" className="mb-6">
        <ListItem
          testID="settings-protocols"
          title="Protocols"
          subtitle={hint(describeConnections(protocols))}
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="git-network-outline" tone="blue" />}
          trailing={chevron}
          selected={selected === 'protocols'}
          onPress={() => openTab('/settings/protocols')}
        />
        <ListItem
          title="XMTP environment"
          subtitle={
            compact
              ? xmtpEnvironment()
              : `${xmtpEnvironment()}, reachable only from clients on the same environment`
          }
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="globe-outline" tone="teal" />}
        />
        <ListItem
          title="Inbox id"
          subtitle={xmtp?.self.participantId ?? 'Not connected'}
          numberOfLinesSubtitle={1}
          leading={<RowIcon name="finger-print-outline" tone="grey" />}
        />
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

function describeConnections(connections: Record<string, ProtocolConnection>): string {
  const connected = connectableProtocols().filter((p) => {
    const { status, login } = connectionFor(connections, p.id);
    return status === 'ready' && !login;
  });
  const failed = connectableProtocols().filter(
    (p) => connectionFor(connections, p.id).status === 'error'
  );

  if (connected.length === 0) {
    return failed.length > 0
      ? `Nothing connected: ${failed.map((p) => p.label).join(' and ')} failed`
      : 'Nothing connected yet';
  }

  const summary = `${connected.map((p) => p.label).join(', ')} connected`;
  return failed.length > 0
    ? `${summary} · ${failed.map((p) => p.label).join(', ')} failed`
    : summary;
}

import { useCallback, useEffect, useState } from 'react';

import { Badge, ConfirmSheet, Icon, ListItem, Loading, Note, Section, Text } from '@/design';
import { errorMessage } from '@/core/errors';
import { useChatStore, xmtpSessionFor } from '@/core/messaging/chat-store';
import { formatDayLabel } from '@/core/messaging/preview';
import { useAction } from '@/features/use-action';
import { SettingsScreen } from '@/features/settings/settings-screen';
import {
  listXmtpInstallations,
  revokeXmtpInstallations,
  type XmtpInstallation as Installation,
} from '@/features/xmtp-devices';

export default function DevicesScreen() {
  const session = useChatStore(xmtpSessionFor);

  const [installations, setInstallations] = useState<Installation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Installation | null>(null);

  const load = useCallback(async () => {
    try {
      setInstallations(await listXmtpInstallations());
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not read your devices'));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load, session]);

  const revoke = useAction(
    async (installation: Installation) => {
      await revokeXmtpInstallations([installation.id]);
      await load();
    },
    { success: 'Device revoked', failure: 'Could not revoke that device' }
  );

  const others = (installations ?? []).filter((i) => !i.current);
  const here = (installations ?? []).find((i) => i.current);

  return (
    <SettingsScreen title="Devices">
      {installations === null ? (
        <Loading />
      ) : (
        <>
          <Section
            title="This device"
            surface="card"
            empty="Not connected to XMTP. If every installation slot is taken, revoke an old device below, then reconnect."
            className="mb-6">
            {here ? (
              <ListItem
                title="Signed in here"
                subtitle={describe(here)}
                numberOfLinesSubtitle={2}
                leading={<Icon name="phone-portrait-outline" size={20} tone="brand" />}
                trailing={<Badge label="Current" tone="success" />}
              />
            ) : null}
          </Section>

          <Section
            title={others.length > 0 ? `Other devices · ${others.length}` : 'Other devices'}
            surface="card"
            empty="This account is only signed in here."
            className="mb-4">
            {others.map((installation) => (
              <ListItem
                key={installation.id}
                title={`Device ${installation.id.slice(0, 8)}`}
                subtitle={describe(installation)}
                numberOfLinesSubtitle={2}
                leading={<Icon name="phone-portrait-outline" size={20} tone="muted" />}
                trailing={<Icon name="close-circle-outline" size={20} tone="danger" />}
                onPress={() => setConfirming(installation)}
              />
            ))}
          </Section>
        </>
      )}

      {error ? (
        <Note tone="danger" className="mx-gutter mb-4">
          {error}
        </Note>
      ) : null}

      <Note className="mx-gutter" title="What a device is" icon="phone-portrait-outline">
        <Text variant="footnote">
          Each device holds its own keys and its own copy of your messages. Nothing sits on a server
          for a new device to download. That is why a fresh install starts empty, and why revoking a
          device here cuts it off for good rather than signing it out.
        </Text>
      </Note>

      <ConfirmSheet
        visible={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Revoke this device?"
        body={[
          'That device will no longer be able to read or send messages for this account. It cannot be undone: the device would have to be added again from scratch, and it would start with no history.',
          'This needs a signature from your account.',
        ]}
        confirm={{
          label: 'Revoke device',
          busyLabel: 'Revoking…',
          tone: 'danger',
          onPress: async () => {
            if (confirming) await revoke.run(confirming);
            setConfirming(null);
          },
        }}
      />
    </SettingsScreen>
  );
}

function describe(installation: Installation): string {
  const id = `${installation.id.slice(0, 12)}…`;
  return installation.createdAt ? `Added ${formatDayLabel(installation.createdAt)} · ${id}` : id;
}

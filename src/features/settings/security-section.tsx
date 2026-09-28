import { useState } from 'react';

import { Chevron, ConfirmSheet, ListItem, RowIcon, Section, toast, Toggle } from '@/design';
import { reportError } from '@/core/app/report-error';
import { useAccountStore } from '@/core/account/account-store';
import {
  disableKeyProtection,
  enableKeyProtection,
  isKeyProtectionEnabled,
} from '@/core/account/key-protection';
import { type BiometricCapability, biometricCapability } from '@/core/account/lock';
import { useLockStore } from '@/core/account/lock-store';
import { openTab } from '@/features/navigation/open';
import { useKeyedLoad } from '@/lib/use-keyed-load';

interface Biometrics extends BiometricCapability {
  protectedKeys: boolean;
}

const NO_BIOMETRICS: Biometrics = {
  available: false,
  enrolled: false,
  label: 'Biometrics',
  protectedKeys: false,
};

async function readBiometrics(): Promise<Biometrics> {
  try {
    const [capability, protectedKeys] = await Promise.all([
      biometricCapability(),
      isKeyProtectionEnabled(),
    ]);
    return { ...capability, protectedKeys };
  } catch (error) {
    reportError(error);
    return NO_BIOMETRICS;
  }
}

export function SecuritySection({
  compact,
  pinSelected,
  pinOffSelected,
}: {
  compact: boolean;
  pinSelected: boolean;
  pinOffSelected: boolean;
}) {
  const setup = useLockStore((s) => s.setup);
  const biometrics = useKeyedLoad('biometrics', readBiometrics).value;
  if (!setup || !biometrics) return null;

  const hint = (text: string) => (compact ? undefined : text);
  const chevron = compact ? undefined : <Chevron />;

  return (
    <Section title="Security" surface="card" className="mb-6">
      {biometrics.available ? (
        <BiometricRows biometrics={biometrics} lockOn={setup.biometric} hint={hint} />
      ) : null}

      {setup.pin ? (
        <>
          <ListItem
            testID="settings-change-pin"
            title="Change PIN"
            subtitle={hint(
              setup.biometric && biometrics.available
                ? `Asked for when ${biometrics.label} does not work`
                : 'Asked for when the app opens'
            )}
            numberOfLinesSubtitle={2}
            leading={<RowIcon name="keypad-outline" tone="blue" />}
            trailing={chevron}
            selected={pinSelected}
            onPress={() => openTab('/settings/pin')}
          />
          <ListItem
            testID="settings-turn-off-pin"
            title="Turn off PIN"
            leading={<RowIcon name="close-circle-outline" tone="grey" />}
            trailing={chevron}
            selected={pinOffSelected}
            onPress={() => openTab('/settings/pin-off')}
          />
        </>
      ) : (
        <ListItem
          testID="settings-set-pin"
          title="Set PIN"
          subtitle={hint('Ask for a PIN of its own whenever the app opens')}
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="keypad-outline" tone="blue" />}
          trailing={chevron}
          selected={pinSelected}
          onPress={() => openTab('/settings/pin')}
        />
      )}
    </Section>
  );
}

function BiometricRows({
  biometrics,
  lockOn,
  hint,
}: {
  biometrics: Biometrics;
  lockOn: boolean;
  hint: (text: string) => string | undefined;
}) {
  const { label, enrolled } = biometrics;
  const noteJustAuthenticated = useLockStore((s) => s.noteJustAuthenticated);
  const setBiometricLock = useLockStore((s) => s.setBiometricLock);
  const accounts = useAccountStore((st) => st.accounts);

  const [protectedKeys, setProtectedKeys] = useState(biometrics.protectedKeys);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const ids = accounts.map((a) => a.id);

  function unchanged(reason: 'denied' | 'unreadable') {
    return reason === 'denied'
      ? `${label} was not confirmed, so nothing changed`
      : 'Your recovery phrase could not be read, so nothing changed';
  }

  async function changeLock(next: boolean): Promise<boolean> {
    if (!next && protectedKeys) {
      const unsealed = await disableKeyProtection(ids);
      if (!unsealed.ok) {
        toast.error(unchanged(unsealed.reason));
        return false;
      }
      setProtectedKeys(false);
    }
    return setBiometricLock(next, label);
  }

  async function applyProtection(next: boolean) {
    setBusy(true);
    const change = next ? enableKeyProtection : disableKeyProtection;
    const result = await change(ids).catch(() => null);
    setBusy(false);

    if (!result) toast.error('Could not change key protection');
    else if (!result.ok) toast.error(unchanged(result.reason));
    else {
      setProtectedKeys(next);
      noteJustAuthenticated();
    }
  }

  return (
    <>
      <ListItem
        title={`Require ${label}`}
        subtitle={hint(
          enrolled ? 'Asks before showing your accounts' : `Set up ${label} on this device first`
        )}
        numberOfLinesSubtitle={2}
        leading={<RowIcon name="finger-print-outline" tone="green" />}
        trailing={
          <Toggle
            label={`Require ${label}`}
            value={lockOn}
            disabled={!enrolled || busy}
            onValueChange={async (next) => {
              setBusy(true);
              const applied = await changeLock(next).catch(() => {
                toast.error('Could not change the lock setting');
                return false;
              });
              setBusy(false);
              if (applied) noteJustAuthenticated();
            }}
          />
        }
      />

      {lockOn ? (
        <ListItem
          title="Also protect keys"
          subtitle={hint(
            `Your recovery phrase is sealed in the keychain and cannot be read without ${label}`
          )}
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="lock-closed-outline" tone="red" />}
          trailing={
            <Toggle
              label="Also protect keys"
              value={protectedKeys}
              disabled={busy}
              onValueChange={(next) => {
                if (next) setConfirming(true);
                else void applyProtection(false);
              }}
            />
          }
        />
      ) : null}

      <ConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Write down your phrase first"
        body={[
          `With this on, ${label} is required to read your recovery phrase as well as to open the app. Nothing running on this device can get at your keys without you.`,
          `The catch: iOS discards these keys whenever the ${label} on this device changes. Adding a face or fingerprint is enough. Your messages and settings survive, but you will have to import each account's recovery phrase again. If it is not written down, that account is gone for good.`,
        ]}
        busy={busy}
        confirm={{
          label: 'My phrase is written down. Turn it on',
          onPress: () => {
            setConfirming(false);
            void applyProtection(true);
          },
        }}
      />
    </>
  );
}

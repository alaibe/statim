import { useEffect, useState } from 'react';

import { ConfirmSheet, ListItem, RowIcon, Section, toast, Toggle } from '@/design';
import { reportError } from '@/core/app/report-error';
import { useAccountStore } from '@/core/account/account-store';
import {
  disableKeyProtection,
  enableKeyProtection,
  isKeyProtectionEnabled,
} from '@/core/account/key-protection';
import { biometricCapability, readLockSetup } from '@/core/account/lock';
import { useLockStore } from '@/core/account/lock-store';

export function BiometricSection() {
  const noteJustAuthenticated = useLockStore((s) => s.noteJustAuthenticated);
  const setBiometricLock = useLockStore((s) => s.setBiometricLock);
  const accounts = useAccountStore((st) => st.accounts);

  const [label, setLabel] = useState('Biometrics');
  const [enrolled, setEnrolled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [protectedKeys, setProtectedKeys] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const capability = await biometricCapability();
      setLabel(capability.label);
      setAvailable(capability.available);
      setEnrolled(capability.enrolled);
      setEnabled((await readLockSetup()).biometric);
      setProtectedKeys(await isKeyProtectionEnabled());
    })().catch(reportError);
  }, []);

  if (!available) return null;

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
      <Section title="Security" surface="card" className="mb-6">
        <ListItem
          title={`Require ${label}`}
          subtitle={
            enrolled
              ? 'Asks before showing your accounts, and again after a minute in the background'
              : `Set up ${label} on this device first`
          }
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="finger-print-outline" tone="green" />}
          trailing={
            <Toggle
              label={`Require ${label}`}
              value={enabled}
              disabled={!enrolled || busy}
              onValueChange={async (next) => {
                setBusy(true);
                const applied = await changeLock(next).catch(() => {
                  toast.error('Could not change the lock setting');
                  return false;
                });
                setBusy(false);
                if (!applied) return;
                setEnabled(next);
                noteJustAuthenticated();
              }}
            />
          }
        />

        {enabled ? (
          <ListItem
            title="Also protect keys"
            subtitle={`Your recovery phrase is sealed in the keychain and cannot be read without ${label}`}
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
      </Section>

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

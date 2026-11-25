import { useState } from "react";
import { useAccountStore } from "@/core/account/account-store";
import { type BiometricCapability, biometricCapability } from "@/core/account/biometrics";
import { disableKeyProtection, enableKeyProtection, isKeyProtectionEnabled } from "@/core/account/key-protection";
import { useLockStore } from "@/core/account/lock-store";
import { reportError } from "@/core/app/report-error";
import { ConfirmDialog, SettingsRow, toast } from "@/design";
import { openTab } from "@/features/navigation/open";
import { PageLink, SettingsGroup } from "@/features/settings/settings-group";
import { useKeyedLoad } from "@/lib/use-keyed-load";

interface Biometrics extends BiometricCapability {
  protectedKeys: boolean;
}

const NO_BIOMETRICS: Biometrics = {
  available: false,
  enrolled: false,
  label: "Biometrics",
  protectedKeys: false,
};

async function readBiometrics(): Promise<Biometrics> {
  try {
    const [capability, protectedKeys] = await Promise.all([biometricCapability(), isKeyProtectionEnabled()]);
    return { ...capability, protectedKeys };
  } catch (error) {
    reportError(error);
    return NO_BIOMETRICS;
  }
}

/** The desktop vault cannot tie an item to Touch ID, so keys there are protected by the vault alone. */
const SEALS_KEYS = process.env.EXPO_OS !== "web";

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
  const biometrics = useKeyedLoad("biometrics", readBiometrics).value;
  if (!setup || !biometrics) return null;

  return (
    <SettingsGroup label="Security" compact={compact}>
      {biometrics.available ? <BiometricRows biometrics={biometrics} lockOn={setup.biometric} /> : null}

      {setup.pin ? (
        <>
          <PageLink
            compact={compact}
            testID="settings-change-pin"
            label="Change PIN"
            description={
              setup.biometric && biometrics.available
                ? `Asked for when ${biometrics.label} doesn't work`
                : "Asked for when the app opens"
            }
            icon="grid-3x3"
            selected={pinSelected}
            onPress={() => openTab("/settings/pin")}
          />
          <PageLink
            compact={compact}
            testID="settings-turn-off-pin"
            label="Turn off PIN"
            icon="circle-x"
            selected={pinOffSelected}
            onPress={() => openTab("/settings/pin-off")}
          />
        </>
      ) : (
        <PageLink
          compact={compact}
          testID="settings-set-pin"
          label="Set PIN"
          description="Ask for a PIN of its own whenever the app opens"
          icon="grid-3x3"
          selected={pinSelected}
          onPress={() => openTab("/settings/pin")}
        />
      )}
    </SettingsGroup>
  );
}

function BiometricRows({ biometrics, lockOn }: { biometrics: Biometrics; lockOn: boolean }) {
  const { label, enrolled } = biometrics;
  const noteJustAuthenticated = useLockStore((s) => s.noteJustAuthenticated);
  const setBiometricLock = useLockStore((s) => s.setBiometricLock);
  const accounts = useAccountStore((st) => st.accounts);

  const [protectedKeys, setProtectedKeys] = useState(biometrics.protectedKeys);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const ids = accounts.map((a) => a.id);

  function unchanged(reason: "denied" | "unreadable") {
    return reason === "denied"
      ? `${label} was not confirmed, so nothing changed`
      : "Your recovery phrase could not be read, so nothing changed";
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
    return setBiometricLock(next);
  }

  async function applyProtection(next: boolean) {
    setBusy(true);
    const change = next ? enableKeyProtection : disableKeyProtection;
    const result = await change(ids).catch(() => null);
    setBusy(false);

    if (!result) toast.error("Couldn't change key protection");
    else if (!result.ok) toast.error(unchanged(result.reason));
    else {
      setProtectedKeys(next);
      noteJustAuthenticated();
    }
  }

  return (
    <>
      <SettingsRow
        label={`Require ${label}`}
        description={enrolled ? "Asks before showing your accounts" : `Set up ${label} on this device first`}
        icon="fingerprint-pattern"
        toggle={{
          value: lockOn,
          disabled: !enrolled || busy,
          onValueChange: (next) => {
            setBusy(true);
            void changeLock(next)
              .catch(() => {
                toast.error("Couldn't change the lock setting");
                return false;
              })
              .then((applied) => {
                setBusy(false);
                if (applied) noteJustAuthenticated();
              });
          },
        }}
      />

      {lockOn && SEALS_KEYS ? (
        <SettingsRow
          label="Also protect keys"
          description={`Your recovery phrase is sealed in the keychain and can't be read without ${label}`}
          icon="lock"
          toggle={{
            value: protectedKeys,
            disabled: busy,
            onValueChange: (next) => {
              if (next) setConfirming(true);
              else void applyProtection(false);
            },
          }}
        />
      ) : null}

      <ConfirmDialog
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Write down your phrase first"
        body={[
          `With this on, ${label} is required to read your recovery phrase as well as to open the app. Nothing running on this device can get at your keys without you.`,
          `The catch: iOS discards these keys whenever the ${label} on this device changes. Adding a face or fingerprint is enough. Your messages and settings survive, but you will have to import each account's recovery phrase again. If it is not written down, that account is gone for good.`,
        ]}
        busy={busy}
        confirm={{
          label: "Protect keys",
          onPress: () => {
            setConfirming(false);
            void applyProtection(true);
          },
        }}
      />
    </>
  );
}

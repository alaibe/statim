import { useEffect, useState } from "react";
import { View } from "react-native";

import { relayState, turnOffRelay, turnOnRelay } from "@/core/icloud/relay";
import { SECTION_GAP, Section, SettingsRow } from "@/design";

import { opensAtLogin, setOpenAtLogin } from "./open-at-login";
import { useAccountSwitch } from "./use-account-switch";

export const notificationsIntro =
  "Statim notifies you while it runs. Closing the window leaves it running; quitting stops it until you open it again.";

export const notificationsHint: string | null = "Open at login";

export function NotificationSettings() {
  return (
    <>
      <OpenAtLogin />
      <NotifyIphone />
    </>
  );
}

function OpenAtLogin() {
  const [atLogin, setAtLogin] = useState(false);

  useEffect(() => {
    opensAtLogin()
      .then(setAtLogin)
      .catch(() => {});
  }, []);

  async function toggle(next: boolean) {
    setAtLogin(next);
    await setOpenAtLogin(next).catch(() => setAtLogin(!next));
  }

  return (
    <View style={{ marginBottom: SECTION_GAP }}>
      <Section label="Startup">
        <SettingsRow
          testID="open-at-login"
          label="Open at login"
          description="Starts Statim without a window when you log in, so messages arrive from the start. Off by default."
          icon="zap"
          toggle={{ value: atLogin, onValueChange: (next) => void toggle(next) }}
        />
      </Section>
    </View>
  );
}

function NotifyIphone() {
  const { state, change } = useAccountSwitch(
    relayState,
    turnOnRelay,
    turnOffRelay,
    "Couldn't change iPhone notifications",
  );

  if (!state || state === "unavailable") return null;
  return (
    <View style={{ marginBottom: SECTION_GAP }}>
      <Section label="Your iPhone">
        <SettingsRow
          testID="notify-iphone"
          label="Notify my iPhone"
          description={
            state === "signed-out"
              ? "iCloud signed this computer out. Turn it on to sign in again."
              : "While this window is in the background, new messages wake your iPhone through your own iCloud, encrypted with a key from this account. Off by default."
          }
          icon="smartphone"
          toggle={{ value: state === "on", disabled: change.busy, onValueChange: (next) => void change.run(next) }}
        />
      </Section>
    </View>
  );
}

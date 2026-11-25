import { View } from "react-native";

import { icloudContainer } from "@/core/icloud/container";
import { listeningState, listenToComputer, stopListening } from "@/core/icloud/phone";
import { SECTION_GAP, Section, SettingsRow } from "@/design";

import { useAccountSwitch } from "./use-account-switch";

export const notificationsIntro =
  "Statim notifies you while it runs. iOS stops it soon after you leave it, so Statim on your computer can wake this iPhone instead.";

/** Hidden without an iCloud container in the build, since the page's one switch needs it. */
export const notificationsHint = icloudContainer() ? "From your computer" : null;

export function NotificationSettings() {
  const { state, change } = useAccountSwitch(
    listeningState,
    listenToComputer,
    stopListening,
    "Couldn't change notifications from your computer",
  );

  if (!state || state === "unavailable") return null;
  return (
    <View style={{ marginBottom: SECTION_GAP }}>
      <Section label="From your computer">
        <SettingsRow
          testID="from-computer"
          label="Notifications from your computer"
          description="Statim on your computer wakes this iPhone through your iCloud when a message arrives. It needs the same iCloud and this account on the computer. Off by default."
          icon="bell"
          toggle={{ value: state === "on", disabled: change.busy, onValueChange: (next) => void change.run(next) }}
        />
      </Section>
    </View>
  );
}

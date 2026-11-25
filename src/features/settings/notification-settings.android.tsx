import { useState } from "react";
import { View } from "react-native";

import { setStayConnected, staysConnected } from "@/core/stay-connected";
import { SECTION_GAP, Section, SettingsRow } from "@/design";

export const notificationsIntro =
  "Statim notifies you while it runs. Android stops it soon after you leave it, and with it the connections that bring messages in.";

export const notificationsHint: string | null = "Stay connected";

export function NotificationSettings() {
  return <StayConnected />;
}

function StayConnected() {
  const [on, setOn] = useState(staysConnected);

  function toggle(next: boolean) {
    setStayConnected(next);
    setOn(next);
  }

  return (
    <View style={{ marginBottom: SECTION_GAP }}>
      <Section>
        <SettingsRow
          testID="stay-connected"
          label="Stay connected"
          description="Keeps Statim running after you leave it, so messages arrive and notify. While it is on, Android shows a Connected notification, and it uses more battery. Off by default."
          icon="zap"
          toggle={{ value: on, onValueChange: toggle }}
        />
      </Section>
    </View>
  );
}

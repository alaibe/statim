import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { SECTION_GAP, Section, SettingsRow } from "@/design";

const MAC = /Mac/.test(navigator.userAgent);

export function MenuBarSetting() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (MAC) return;
    invoke<boolean>("menu_bar_hidden")
      .then(setHidden)
      .catch(() => {});
  }, []);

  if (MAC) return null;

  async function toggle(next: boolean) {
    setHidden(next);
    await invoke("menu_bar_set_hidden", { hidden: next }).catch(() => setHidden(!next));
  }

  return (
    <View style={{ marginBottom: SECTION_GAP }}>
      <Section label="Window">
        <SettingsRow
          testID="hide-menu-bar"
          label="Hide menu bar"
          description="Press Alt to show it until your next click."
          icon="menu"
          toggle={{ value: hidden, onValueChange: (next) => void toggle(next) }}
        />
      </Section>
    </View>
  );
}

import { View } from "react-native";

import { type ThemeChoice, useAppearanceStore } from "@/core/app/appearance";
import { desktop, SECTION_GAP, Section, Segmented, SettingsRow } from "@/design";
import { MenuBarSetting } from "@/features/settings/menu-bar-setting";
import { SettingsScreen } from "@/features/settings/settings-screen";

const THEMES: { value: ThemeChoice; label: string; testID: string }[] = [
  { value: "system", label: "System", testID: "theme-system" },
  { value: "dark", label: "Dark", testID: "theme-dark" },
  { value: "light", label: "Light", testID: "theme-light" },
];

const SYSTEM = process.env.EXPO_OS === "ios" ? "iOS" : process.env.EXPO_OS === "android" ? "Android" : "system";

export default function AppearanceScreen() {
  const theme = useAppearanceStore((s) => s.theme);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const quickTips = useAppearanceStore((s) => s.quickTips);
  const setQuickTips = useAppearanceStore((s) => s.setQuickTips);

  return (
    <SettingsScreen title="Appearance">
      <View style={{ marginBottom: SECTION_GAP }}>
        <Section label="Theme" description={`System follows your ${SYSTEM} appearance setting.`}>
          <View className={desktop ? "py-3" : "p-4"}>
            <Segmented
              accessibilityLabel="Theme"
              options={THEMES}
              value={theme}
              onChange={(next) => void setTheme(next)}
            />
          </View>
        </Section>
      </View>

      {desktop ? (
        <View style={{ marginBottom: SECTION_GAP }}>
          <Section label="General">
            <SettingsRow
              testID="quick-tips"
              label="Quick tips"
              description="Shows the keys you can press in the status bar."
              icon="keyboard"
              toggle={{ value: quickTips, onValueChange: (next) => void setQuickTips(next) }}
            />
          </Section>
        </View>
      ) : null}

      <MenuBarSetting />
    </SettingsScreen>
  );
}

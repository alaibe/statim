import { View } from 'react-native';

import {
  ChatBackground,
  Checkmark,
  type ChatPatternName,
  Icon,
  ListItem,
  Pressable,
  Section,
  Text,
} from '@/design';
import { useAppearanceStore, type ThemeChoice } from '@/core/app/appearance';
import { SettingsScreen } from '@/features/settings/settings-screen';

const THEMES: { id: ThemeChoice; label: string; hint: string }[] = [
  {
    id: 'system',
    label: 'Match device',
    hint: `Follows your ${process.env.EXPO_OS === 'ios' ? 'iOS' : process.env.EXPO_OS === 'android' ? 'Android' : 'system'} appearance setting`,
  },
  { id: 'light', label: 'Light', hint: '' },
  { id: 'dark', label: 'Dark', hint: '' },
];

const WALLPAPERS: { id: ChatPatternName; label: string }[] = [
  { id: 'doodles', label: 'Doodles' },
  { id: 'bubbles', label: 'Bubbles' },
];

export default function AppearanceScreen() {
  const theme = useAppearanceStore((s) => s.theme);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const wallpaper = useAppearanceStore((s) => s.wallpaper);
  const setWallpaper = useAppearanceStore((s) => s.setWallpaper);

  return (
    <SettingsScreen title="Appearance">
      <Section title="Theme" surface="card" className="mb-6">
        {THEMES.map((entry) => (
          <ListItem
            key={entry.id}
            title={entry.label}
            subtitle={entry.hint || undefined}
            onPress={() => setTheme(entry.id)}
            trailing={<Checkmark selected={entry.id === theme} />}
          />
        ))}
      </Section>

      <Section title="Chat wallpaper" className="mb-6">
        <View className="flex-row gap-3 px-gutter">
          {WALLPAPERS.map((entry) => {
            const active = entry.id === wallpaper;
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={entry.label}
                onPress={() => setWallpaper(entry.id)}
                className="flex-1 gap-1.5">
                <View
                  className={
                    active
                      ? 'h-28 overflow-hidden rounded-card border-2 border-brand'
                      : 'h-28 overflow-hidden rounded-card border border-line'
                  }>
                  <ChatBackground pattern={entry.id} />
                </View>
                <View className="flex-row items-center gap-1.5">
                  <Text variant="caption" className={active ? 'font-semibold' : undefined}>
                    {entry.label}
                  </Text>
                  {active ? <Icon name="checkmark-circle" size={14} tone="brand" /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Section>
    </SettingsScreen>
  );
}

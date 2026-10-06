import { Switch, View, type SwitchProps } from 'react-native';

import { useThemeColors } from '../hooks/use-theme-colors';

interface ToggleProps extends Pick<SwitchProps, 'value' | 'onValueChange' | 'disabled'> {
  label: string;
}

// react-native-web delivers the switch's click to the row's onPress as well.
const KEEP_CLICK_OFF_ROW =
  process.env.EXPO_OS === 'web'
    ? { onClick: (e: { stopPropagation(): void }) => e.stopPropagation() }
    : {};

export function Toggle({ label, ...props }: ToggleProps) {
  const colors = useThemeColors();

  return (
    <View {...KEEP_CLICK_OFF_ROW}>
      <Switch
        trackColor={{ true: colors.brand, false: colors.line }}
        accessibilityLabel={label}
        {...props}
      />
    </View>
  );
}

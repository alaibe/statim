import { View } from "react-native";
import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon, type IconName } from "../icon";

// The design system keeps the interface in ink: every row icon is the same outlined square, danger aside.
export function RowIcon({ name, danger = false }: { name: IconName; danger?: boolean }) {
  const colors = useThemeColors();
  return (
    <View className="h-7 w-7 items-center justify-center rounded-field border border-line bg-surface-sunken">
      <Icon name={name} size={16} color={danger ? colors.danger : colors["content-muted"]} />
    </View>
  );
}

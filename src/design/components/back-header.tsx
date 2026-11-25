import { Icon } from "../icon";
import { Pressable } from "./pressable";
import { Text } from "./text";

interface BackHeaderProps {
  label: string;
  onPress: () => void;
}

export function BackHeader({ label, onPress }: BackHeaderProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      onPress={onPress}
      className="flex-row items-center gap-1 px-2 py-2"
    >
      <Icon name="chevron-left" size={24} tone="accent" />
      <Text className="text-accent">{label}</Text>
    </Pressable>
  );
}

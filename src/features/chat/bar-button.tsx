import { cn, Icon, type IconName, Pressable, Text } from "@/design";

export function BarButton({
  icon,
  label,
  accessibilityLabel = label,
  onPress,
  testID,
  className,
}: {
  icon: IconName;
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  testID?: string;
  className?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={cn(
        "min-h-touch flex-row items-center justify-center gap-2 rounded-full border border-line bg-panel",
        className,
      )}
    >
      <Icon name={icon} size={18} tone="accent" />
      <Text className="font-semibold text-accent">{label}</Text>
    </Pressable>
  );
}

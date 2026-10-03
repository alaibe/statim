import { cn, Icon, type IconName, Pressable, Text } from '@/design';

/** The wide button that stands where the composer would. */
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
        'min-h-tap flex-row items-center justify-center gap-2 rounded-pill border border-line bg-surface-raised',
        className
      )}>
      <Icon name={icon} size={18} tone="brand" />
      <Text className="font-semibold text-brand">{label}</Text>
    </Pressable>
  );
}

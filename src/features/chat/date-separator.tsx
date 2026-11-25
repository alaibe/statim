import { View } from "react-native";
import { formatDayLabel } from "@/core/messaging/preview";
import { Text } from "@/design";

export function DateSeparator({ at }: { at: number }) {
  return (
    <View className="items-center py-2">
      <View className="rounded-full bg-side/90 px-2.5 py-1">
        <Text variant="micro" className="font-medium text-muted">
          {formatDayLabel(at)}
        </Text>
      </View>
    </View>
  );
}

export function SectionDivider({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-2">
      <View className="h-px flex-1 bg-line" />
      <Text variant="micro" className="font-medium text-muted">
        {label}
      </Text>
      <View className="h-px flex-1 bg-line" />
    </View>
  );
}

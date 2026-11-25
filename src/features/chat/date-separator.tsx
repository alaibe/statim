import { View } from "react-native";
import { formatDayLabel } from "@/core/messaging/preview";
import { Divider, Text } from "@/design";

/** A day between messages: a line with the date in the label role. */
export function DateSeparator({ at }: { at: number }) {
  return <SectionDivider label={formatDayLabel(at)} />;
}

export function SectionDivider({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3 px-4 py-2">
      <View className="flex-1">
        <Divider />
      </View>
      <Text variant="label">{label}</Text>
      <View className="flex-1">
        <Divider />
      </View>
    </View>
  );
}

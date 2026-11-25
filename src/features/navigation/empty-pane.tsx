import { View } from "react-native";

import { Text } from "@/design";

export function EmptyPane({ hint }: { hint: string }) {
  return (
    <View className="flex-1 items-center justify-center">
      <View className="rounded-full bg-side px-4 py-2">
        <Text variant="footnote">{hint}</Text>
      </View>
    </View>
  );
}

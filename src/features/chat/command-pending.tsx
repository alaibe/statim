import { View } from "react-native";
import Animated from "react-native-reanimated";

import { Enter, Exit, Text } from "@/design";

export function CommandPending({ label }: { label: string }) {
  return (
    <Animated.View entering={Enter.fade()} exiting={Exit.fade()} className="items-start px-4 pt-2">
      <View className="rounded-lg rounded-bl-md bg-panel px-3.5 py-2">
        <View className="flex-row items-center gap-2">
          <Dots />
          <Text variant="caption" numberOfLines={1} className="text-fg/70">
            {label}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

function Dots() {
  return (
    <View className="flex-row items-center gap-1">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-fg"
          style={{
            animationName: {
              "0%, 100%": { opacity: 0.25 },
              "50%": { opacity: 1 },
            },
            animationDuration: "900ms",
            animationIterationCount: "infinite",
            animationDelay: `${i * 150}ms`,
          }}
        />
      ))}
    </View>
  );
}

import { View } from "react-native";
import Animated from "react-native-reanimated";

import { Enter, Exit, Radius, Text, useThemeColors } from "@/design";

export function CommandPending({ label }: { label: string }) {
  const colors = useThemeColors();
  return (
    <Animated.View entering={Enter.fade()} exiting={Exit.fade()} className="items-start px-4 pt-2">
      <View
        className="px-2.5 py-1.5"
        style={{ borderRadius: Radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel }}
      >
        <View className="flex-row items-center gap-2">
          <Dots />
          <Text variant="meta" numberOfLines={1}>
            {label}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

/** Something is running: three dots in `accent`, pulsing. */
function Dots() {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-1">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: Radius.full,
            backgroundColor: colors.accent,
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

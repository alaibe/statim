import { View } from "react-native";
import Animated from "react-native-reanimated";

import { Enter, Exit, IconButton, Text, useThemeColors } from "@/design";

import type { ComposerBanner } from "./composer-mode";

export function ModeBanner({
  banner,
  editing,
  onCancel,
}: {
  banner: ComposerBanner;
  editing: boolean;
  onCancel: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Animated.View
      entering={Enter.fade()}
      exiting={Exit.fade()}
      className="flex-row items-center gap-2 px-4 py-2"
      style={{ borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.bg }}
    >
      <View style={{ width: 2, height: 32, backgroundColor: colors.accent }} />
      <View className="min-w-0 flex-1">
        <Text variant="label" tone="accent">
          {banner.label}
        </Text>
        {banner.detail ? (
          <Text size="sm" tone="muted" numberOfLines={1}>
            {banner.detail}
          </Text>
        ) : null}
      </View>
      <IconButton icon="x" label={editing ? "Cancel edit" : "Cancel reply"} onPress={onCancel} />
    </Animated.View>
  );
}

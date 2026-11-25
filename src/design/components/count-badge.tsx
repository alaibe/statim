import { View } from "react-native";

import { cn } from "../lib/cn";
import { Text } from "./text";

export function CountBadge({ count, muted = false }: { count?: number; muted?: boolean }) {
  return (
    <View
      className={cn(
        "h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5",
        muted ? "bg-subtle" : "bg-accent",
      )}
    >
      {count ? (
        <Text variant="micro" className="font-bold text-on-accent">
          {count > 999 ? "999+" : count}
        </Text>
      ) : null}
    </View>
  );
}

import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Layer, Layout, Radius, Space } from "../tokens";
import { Keys } from "./keycap";
import { Text } from "./text";

const DELAY = 500;
const WARM = 1000;

/** When the last tooltip closed: within a second the next one in the same rail or toolbar shows at once. */
let closedAt = 0;

/** Shown after 500ms of hover, at once on keyboard focus or while another one just closed. */
export function useTooltip() {
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clear = () => clearTimeout(timer.current);
  useEffect(() => clear, []);

  const open = (now: boolean) => {
    clear();
    if (now || Date.now() - closedAt < WARM) setShown(true);
    else timer.current = setTimeout(() => setShown(true), DELAY);
  };
  const close = () => {
    clear();
    setShown((was) => {
      if (was) closedAt = Date.now();
      return false;
    });
  };

  return {
    shown,
    handlers: {
      onHoverIn: () => open(false),
      onHoverOut: close,
      onFocus: () => open(true),
      onBlur: close,
      onPressIn: close,
    },
  };
}

interface TooltipProps {
  label: string;
  keys?: readonly string[];
  /** Beside its target, for a vertical stack at the window's edge such as the sidebar. */
  side?: "top" | "end";
}

/** `void`, a `line-strong` border, radius `sm`, mono `xs`, 8 from its target, with its shortcut as keycaps. */
export function Tooltip({ label, keys, side = "top" }: TooltipProps) {
  const colors = useThemeColors();
  const place =
    side === "end"
      ? { top: "50%", left: "100%", marginLeft: Space[2], transform: [{ translateY: "-50%" }] }
      : { bottom: "100%", left: "50%", marginBottom: Space[2], transform: [{ translateX: "-50%" }] };
  return (
    <View
      role="tooltip"
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          zIndex: Layer.popover,
          maxWidth: Layout.tooltip,
          flexDirection: "row",
          alignItems: "center",
          gap: Space[2],
          paddingVertical: Space[1],
          paddingHorizontal: Space[2],
          backgroundColor: colors.void,
          borderWidth: 1,
          borderColor: colors["line-strong"],
          borderRadius: Radius.sm,
        },
        place as object,
      ]}
    >
      <Text variant="meta" tone="fg" numberOfLines={1}>
        {label}
      </Text>
      {keys ? <Keys keys={keys} /> : null}
    </View>
  );
}

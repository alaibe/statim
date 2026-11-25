import { useState } from "react";
import { type PressableProps, Pressable as RNPressable, type StyleProp, type ViewStyle } from "react-native";

import { desktop } from "../lib/platform";

export interface PressState {
  pressed: boolean;
  hovered: boolean;
}

export interface PressScaleProps extends Omit<PressableProps, "style" | "children"> {
  className?: string;
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>);
  children?: React.ReactNode | ((state: PressState) => React.ReactNode);
}

/** A touch dims to 85% while pressed; the desktop shows hover and press as fills instead, which callers draw. */
export function Pressable({
  style,
  children,
  onHoverIn,
  onHoverOut,
  onPressIn,
  onPressOut,
  ...props
}: PressScaleProps) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const state = { pressed, hovered };

  return (
    <RNPressable
      {...props}
      onHoverIn={(event) => {
        setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        setHovered(false);
        onHoverOut?.(event);
      }}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={[!desktop && pressed ? { opacity: 0.85 } : null, typeof style === "function" ? style(state) : style]}
    >
      {typeof children === "function" ? children(state) : children}
    </RNPressable>
  );
}

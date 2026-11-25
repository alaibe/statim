import { View } from "react-native";

import { cn } from "../lib/cn";
import { contextMenu, type MenuAnchor } from "../lib/context-menu";
import { type PressHandler, usePress } from "../lib/press";
import { Pressable } from "./pressable";
import { Text } from "./text";

export interface ListItemProps {
  testID?: string;
  title: React.ReactNode;
  subtitle?: string;
  subtitleTrailing?: React.ReactNode;
  meta?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: PressHandler;
  onLongPress?: () => void;
  onContextMenu?: (anchor: MenuAnchor) => void;
  /** The row whose content is open beside the list. */
  selected?: boolean;
  unread?: boolean;
  className?: string;
  numberOfLinesSubtitle?: number;
  accessibilityLabel?: string;
}

export function ListItem({
  testID,
  title,
  subtitle,
  subtitleTrailing,
  meta,
  leading,
  trailing,
  onPress,
  onLongPress,
  onContextMenu,
  selected = false,
  unread = false,
  className,
  numberOfLinesSubtitle = 1,
  accessibilityLabel,
}: ListItemProps) {
  const { pending, press } = usePress(onPress);
  const pressable = Boolean(onPress || onLongPress);

  const body = (
    <View className={cn("min-h-touch flex-row items-center gap-3 px-4 py-2.5", !pressable && "mx-1", className)}>
      {leading}
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text
            variant="title"
            numberOfLines={1}
            className={cn("min-w-0 flex-1 text-md font-semibold", unread && "text-fg")}
          >
            {title}
          </Text>
          {typeof meta === "string" ? (
            <Text variant="caption" className={cn(unread && "font-semibold text-accent")}>
              {meta}
            </Text>
          ) : (
            meta
          )}
        </View>
        {subtitle || subtitleTrailing ? (
          <View className="flex-row items-center gap-2">
            <Text
              variant="footnote"
              numberOfLines={numberOfLinesSubtitle}
              className={cn("min-w-0 flex-1", unread && "font-medium text-muted")}
            >
              {subtitle}
            </Text>
            {subtitleTrailing}
          </View>
        ) : null}
      </View>
      {trailing}
    </View>
  );

  if (!pressable) return body;

  // iOS hides the `Text` inside a pressable row from VoiceOver, so the label is rebuilt from its parts.
  const label =
    accessibilityLabel ?? (typeof title === "string" ? [title, subtitle].filter(Boolean).join(", ") : undefined);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: pending }}
      onPress={press}
      onLongPress={onLongPress}
      {...(onContextMenu ? contextMenu(onContextMenu) : undefined)}
      pressScale={0.99}
      className={cn("mx-1 rounded-lg active:bg-panel", selected && "bg-accent-soft")}
      style={{ borderCurve: "continuous" }}
    >
      {body}
    </Pressable>
  );
}

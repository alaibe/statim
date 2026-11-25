import { View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { contextMenu, type MenuAnchor } from "../lib/context-menu";
import { desktop } from "../lib/platform";
import { type PressHandler, usePress } from "../lib/press";
import { Control, Layout, Radius, Size, Space } from "../tokens";
import { Pressable } from "./pressable";
import { Text } from "./text";

export interface RowProps {
  testID?: string;
  title: React.ReactNode;
  /** The second line, in sans `sm` `muted`. */
  preview?: React.ReactNode;
  /** A time, a count or a size, on the right in mono `xs`. */
  meta?: React.ReactNode;
  /** An icon, an avatar or nothing; an unread row without one shows its dot here. */
  leading?: React.ReactNode;
  /** Tags at the right of the second line, two at most. */
  tags?: React.ReactNode;
  trailing?: React.ReactNode;
  unread?: boolean;
  /** The row whose item is open beside the list. */
  selected?: boolean;
  /** Its list has keyboard focus, so the selected row's bar glows. */
  focused?: boolean;
  done?: boolean;
  onPress?: PressHandler;
  onLongPress?: () => void;
  onContextMenu?: (anchor: MenuAnchor) => void;
  accessibilityLabel?: string;
  previewLines?: number;
}

/** The accent dot of an unread row. */
export function UnreadDot() {
  const colors = useThemeColors();
  return (
    <View
      style={{
        width: Size.dot,
        height: Size.dot,
        borderRadius: Radius.full,
        backgroundColor: colors.accent,
        boxShadow: `0 0 6px ${colors.accent}`,
      }}
    />
  );
}

/** A flat row: no card, no radius, no divider; `hover` under the pointer, `accent-soft` and a 2px bar when selected. */
export function Row({
  testID,
  title,
  preview,
  meta,
  leading,
  tags,
  trailing,
  unread = false,
  selected = false,
  focused = false,
  done = false,
  onPress,
  onLongPress,
  onContextMenu,
  accessibilityLabel,
  previewLines = 1,
}: RowProps) {
  const colors = useThemeColors();
  const { pending, press } = usePress(onPress);
  const two = preview !== undefined || tags !== undefined;
  const height = two ? (desktop ? Layout.row : 68) : desktop ? Control.md : Control.touch;
  const lead = leading ?? (unread ? <UnreadDot /> : null);

  const body = (
    <>
      {lead ? <View style={{ minWidth: Space[4], alignItems: "center" }}>{lead}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: Space[2] }}>
          {leading && unread ? <UnreadDot /> : null}
          {typeof title === "string" ? (
            <Text numberOfLines={1} strong={unread} tone={done ? "muted" : "fg"} style={{ flex: 1, minWidth: 0 }}>
              {title}
            </Text>
          ) : (
            <View style={{ flex: 1, minWidth: 0 }}>{title}</View>
          )}
          {typeof meta === "string" ? <Text variant="meta">{meta}</Text> : meta}
        </View>
        {two ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: Space[2] }}>
            {typeof preview === "string" ? (
              <Text size="sm" tone="muted" numberOfLines={previewLines} style={{ flex: 1, minWidth: 0 }}>
                {preview}
              </Text>
            ) : (
              <View style={{ flex: 1, minWidth: 0 }}>{preview}</View>
            )}
            {tags ? <View style={{ flexDirection: "row", gap: Space[1] }}>{tags}</View> : null}
          </View>
        ) : null}
      </View>
      {trailing}
    </>
  );

  const frame = {
    minHeight: height,
    paddingHorizontal: desktop ? Space[3] : Space[4],
    paddingVertical: Space[2],
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: Space[2],
  };
  const bar = selected ? (
    <View
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: 2,
        backgroundColor: colors.accent,
        boxShadow: focused ? `0 0 12px ${colors.accent}` : undefined,
      }}
    />
  ) : null;

  if (!onPress && !onLongPress) {
    return (
      <View testID={testID} style={[frame, selected ? { backgroundColor: colors["accent-soft"] } : null]}>
        {bar}
        {body}
      </View>
    );
  }

  const label =
    accessibilityLabel ??
    (typeof title === "string" ? [title, typeof preview === "string" ? preview : undefined] : [])
      .filter(Boolean)
      .join(", ");

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label || undefined}
      accessibilityState={{ selected, busy: pending }}
      onPress={press}
      onLongPress={onLongPress}
      {...(onContextMenu ? contextMenu(onContextMenu) : undefined)}
      style={({ hovered, pressed }) => [
        frame,
        {
          backgroundColor: selected
            ? colors["accent-soft"]
            : hovered || (pressed && !desktop)
              ? colors.hover
              : "transparent",
        },
      ]}
    >
      {bar}
      {body}
    </Pressable>
  );
}

/** Rows under a label, as the list region and the sidebar group them: 16 above, 4 below. */
export function RowGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View>
      {label ? (
        <View
          style={{ paddingTop: Space[4], paddingBottom: Space[1], paddingHorizontal: desktop ? Space[3] : Space[4] }}
        >
          <Text variant="label">{label}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

import { View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { type PressHandler } from "../lib/press";
import { Layout, Radius, Space } from "../tokens";
import { Button, IconButton } from "./button";
import { Tag, type TagTone } from "./tag";
import { Text } from "./text";

export type NoticeTone = "info" | "success" | "warning" | "danger" | "accent";

const BAR = { info: "info", success: "success", warning: "warning", danger: "danger", accent: "accent" } as const;
const TAG: Record<NoticeTone, TagTone> = {
  info: "info",
  success: "ok",
  warning: "warn",
  danger: "err",
  accent: "accent",
};

interface NoticeProps {
  tone?: NoticeTone;
  /** The tag's word; status notices default to theirs, an app message names its own (`NEW`). */
  tag?: string;
  message: string;
  /** An optional second line, in `muted`. */
  detail?: string;
  /** At most one action: a secondary button, `sm`. */
  action?: { label: string; onPress: PressHandler; testID?: string };
  /** Only for a notice that can be dismissed without fixing anything. */
  onDismiss?: () => void;
  /** Across the whole window under the title bar, for app-wide state. */
  banner?: boolean;
  testID?: string;
}

/** A message that stays until it is resolved: a 2px bar in its colour, the tag, the message, one action. */
export function Notice({
  tone = "info",
  tag,
  message,
  detail,
  action,
  onDismiss,
  banner = false,
  testID,
}: NoticeProps) {
  const colors = useThemeColors();
  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: Space[3],
        minHeight: banner ? Layout.banner : undefined,
        padding: banner ? undefined : Space[3],
        paddingVertical: banner ? Space[1] : undefined,
        paddingHorizontal: Space[3],
        backgroundColor: banner ? colors.void : colors.panel,
        borderColor: colors.line,
        borderWidth: banner ? 0 : 1,
        borderBottomWidth: 1,
        borderRadius: banner ? 0 : Radius.md,
        boxShadow: banner ? undefined : `inset 2px 0 0 ${colors[BAR[tone]]}`,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", gap: Space[2], alignItems: "flex-start" }}>
        {tone !== "accent" || tag ? <Tag tone={TAG[tone]} label={tag} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm">{message}</Text>
          {detail ? (
            <Text size="sm" tone="muted">
              {detail}
            </Text>
          ) : null}
        </View>
      </View>
      {action ? <Button size="sm" label={action.label} onPress={action.onPress} testID={action.testID} /> : null}
      {onDismiss ? <IconButton icon="x" label="Dismiss" size="sm" onPress={onDismiss} /> : null}
    </View>
  );
}

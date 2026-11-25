import { Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemeColors } from "../hooks/use-theme-colors";
import { DRAG_REGION } from "../lib/drag-region";
import { desktop } from "../lib/platform";
import { Layout, Space } from "../tokens";
import { IconButton } from "./button";
import { Text, textStyle } from "./text";

interface PhoneHeaderProps {
  title: string;
  /** The live state the desktop's status bar carries, as one line: "Connecting · XMTP". */
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  /** At most one action, a ghost icon button. */
  action?: React.ReactNode;
  /** A screen that draws under the notch already (a stack header) skips the top inset. */
  inset?: boolean;
  testID?: string;
}

const PHONE_TITLE = { ...textStyle("heading"), fontSize: 15, lineHeight: 20 };
const PHONE_SUBTITLE = { ...textStyle("control"), fontSize: 11, lineHeight: 14 };

/** The phone's header: 52 on `side`, back, the place or item in mono `md` 600, the live state under it. */
export function PhoneHeader({
  title,
  subtitle,
  onBack,
  backLabel = "Back",
  action,
  inset = true,
  testID,
}: PhoneHeaderProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={{
        paddingTop: inset ? insets.top : 0,
        backgroundColor: colors.side,
        borderBottomWidth: 1,
        borderColor: colors.line,
      }}
    >
      <View
        style={{
          minHeight: Layout["header-phone"],
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: onBack ? 0 : Space[4],
          paddingRight: Space[1],
        }}
      >
        {onBack ? <IconButton icon="chevron-left" label={backLabel} onPress={onBack} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <RNText accessibilityRole="header" numberOfLines={1} style={[PHONE_TITLE, { color: colors.fg }]}>
            {title}
          </RNText>
          {subtitle ? (
            <RNText numberOfLines={1} style={[PHONE_SUBTITLE, { color: colors.muted }]}>
              {subtitle}
            </RNText>
          ) : null}
        </View>
        {action}
      </View>
    </View>
  );
}

interface PageHeaderProps {
  title: string;
  intro?: string;
  actions?: React.ReactNode;
}

/** The detail's top row on the desktop: the page's title, a one-line intro in `muted`, its actions on the right. */
export function PageHeader({ title, intro, actions }: PageHeaderProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: Space[4],
        paddingHorizontal: desktop ? Space[6] : Space[4],
        paddingTop: Space[6],
        paddingBottom: Space[4],
      }}
    >
      <View style={{ flex: 1, gap: Space[1] }}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {intro ? <Text tone="muted">{intro}</Text> : null}
      </View>
      {actions ? <View style={{ flexDirection: "row", gap: Space[2] }}>{actions}</View> : null}
    </View>
  );
}

/** `void`, 32 (38 on macOS), a drag region; the window buttons, back and forward, and where you are. */
export function TitleBar({
  place,
  item,
  leading,
  trailing,
  mac,
}: {
  place: string;
  item?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  mac: boolean;
}) {
  const colors = useThemeColors();
  return (
    <View
      {...DRAG_REGION}
      accessibilityRole="header"
      style={{
        height: mac ? Layout["titlebar-mac"] : Layout.titlebar,
        flexDirection: "row",
        alignItems: "center",
        paddingLeft: mac ? Layout["titlebar-mac-inset"] : Space[2],
        paddingRight: Space[2],
        backgroundColor: colors.void,
        borderBottomWidth: 1,
        borderColor: colors.line,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: Space[1], minWidth: 120 }}>{leading}</View>
      <View {...DRAG_REGION} style={{ flex: 1, flexDirection: "row", justifyContent: "center", gap: Space[2] }}>
        <Text variant="control" tone={item ? "muted" : "fg"} numberOfLines={1}>
          {place}
        </Text>
        {item ? (
          <>
            <Text variant="control" tone="muted">
              /
            </Text>
            <Text variant="control" numberOfLines={1} style={{ flexShrink: 1 }}>
              {item}
            </Text>
          </>
        ) : null}
      </View>
      <View
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: Space[1], minWidth: 120 }}
      >
        {trailing}
      </View>
    </View>
  );
}

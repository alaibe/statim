import { Children, createContext, Fragment, isValidElement, useContext } from "react";
import { View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon, type IconName } from "../icon";
import { desktop } from "../lib/platform";
import { type PressHandler, usePress } from "../lib/press";
import { Control, Radius, Space, withAlpha } from "../tokens";
import { Toggle } from "./choice";
import { Pressable } from "./pressable";
import { Text } from "./text";

/** Rows inside a raised section sit on its padding, not on the page's. */
const Raised = createContext(false);

interface SectionProps {
  /** The mono label role above the rows; a page's main sections take a `heading` instead. */
  label?: string;
  heading?: string;
  description?: string;
  /** Secondary or ghost buttons, `sm`, on the right of the header. */
  actions?: React.ReactNode;
  /** The one section a screen sets apart: `panel`, a `line` border, radius `lg`. */
  raised?: boolean;
  /** The danger zone: raised, with a `danger` border at 50%. */
  danger?: boolean;
  /** Shown in place of rows when there are none. */
  empty?: string;
  testID?: string;
  children?: React.ReactNode;
}

/**
 * Lines and headings instead of cards. On the desktop rows sit on `bg` with a 1px `line` above each; on a phone they
 * sit on `panel` between edge-to-edge lines, with the label above.
 */
export function Section({
  label,
  heading,
  description,
  actions,
  raised,
  danger,
  empty,
  testID,
  children,
}: SectionProps) {
  const colors = useThemeColors();
  const rows = Children.toArray(children).filter(Boolean);
  const inset = desktop ? 0 : Space[4];
  const lifted = raised || danger;

  const header =
    label || heading || description || actions ? (
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: Space[4],
          paddingBottom: desktop || lifted ? Space[3] : Space[2],
          paddingHorizontal: lifted ? 0 : inset,
        }}
      >
        <View style={{ flex: 1, gap: Space[1] }}>
          {heading ? <Text variant="heading">{heading}</Text> : label ? <Text variant="label">{label}</Text> : null}
          {description ? (
            <Text size="sm" tone="muted">
              {description}
            </Text>
          ) : null}
        </View>
        {actions ? <View style={{ flexDirection: "row", gap: Space[2] }}>{actions}</View> : null}
      </View>
    ) : null;

  const content =
    rows.length === 0 && empty ? (
      <View style={{ paddingVertical: Space[3], paddingHorizontal: lifted ? 0 : inset }}>
        <Text size="sm" tone="muted">
          {empty}
        </Text>
      </View>
    ) : (
      rows.map((row, index) => (
        <Fragment key={isValidElement(row) && row.key != null ? row.key : index}>
          {index > 0 || desktop ? <View style={{ height: 1, backgroundColor: colors.line }} /> : null}
          {row}
        </Fragment>
      ))
    );

  if (lifted) {
    return (
      <View
        testID={testID}
        style={{
          marginHorizontal: inset,
          padding: Space[4],
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: danger ? withAlpha(colors.danger, 0.5) : colors.line,
          borderRadius: Radius.lg,
        }}
      >
        {header}
        <Raised.Provider value>{content}</Raised.Provider>
      </View>
    );
  }

  return (
    <View testID={testID}>
      {header}
      {desktop ? (
        content
      ) : (
        <View
          style={{ backgroundColor: colors.panel, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}
        >
          {content}
        </View>
      )}
    </View>
  );
}

/** A 1px `line` across its region, edge to edge. */
export function Divider() {
  const colors = useThemeColors();
  return <View style={{ height: 1, alignSelf: "stretch", backgroundColor: colors.line }} />;
}

/** The gap between sections: 32 on the desktop, 24 on a phone. */
export const SECTION_GAP = desktop ? Space[8] : Space[6];

export interface SettingsRowProps {
  testID?: string;
  label: string;
  description?: string;
  icon?: IconName;
  /** A value shown on the right, in `muted`. */
  value?: string;
  /** Any control on the right: a button, a tag. */
  control?: React.ReactNode;
  /** A setting that takes effect at once: the whole row toggles it. */
  toggle?: { value: boolean; onValueChange(value: boolean): void; disabled?: boolean };
  /** Opens a page: the row gets a trailing chevron. */
  onPress?: PressHandler;
  /** Opens something outside the app: `arrow-up-right` instead of the chevron. */
  external?: boolean;
  danger?: boolean;
  selected?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** Label and description on the left, the control right-aligned; 12 above and below. */
export function SettingsRow({
  testID,
  label,
  description,
  icon,
  value,
  control,
  toggle,
  onPress,
  external = false,
  danger = false,
  selected = false,
  disabled = false,
  accessibilityLabel,
}: SettingsRowProps) {
  const colors = useThemeColors();
  const raised = useContext(Raised);
  const { pending, press } = usePress(onPress);
  const off = disabled || toggle?.disabled;
  const act = toggle ? () => toggle.onValueChange(!toggle.value) : press;

  const body = (
    <>
      {icon ? <Icon name={icon} size={20} tone={danger ? "danger" : "muted"} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text tone={off ? "subtle" : danger ? "danger" : "fg"}>{label}</Text>
        {description ? (
          <Text size="sm" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text tone="muted" numberOfLines={1} style={{ flexShrink: 1, maxWidth: "50%" }}>
          {value}
        </Text>
      ) : null}
      {control}
      {toggle ? <Toggle value={toggle.value} disabled={off} label={label} decorative /> : null}
      {onPress && !toggle ? <Icon name={external ? "arrow-up-right" : "chevron-right"} size={16} tone="muted" /> : null}
    </>
  );

  const frame = {
    minHeight: desktop ? Control.md : Control.touch,
    paddingVertical: Space[3],
    paddingHorizontal: desktop || raised ? 0 : Space[4],
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: desktop ? Space[4] : Space[3],
  };

  if (!act)
    return (
      <View testID={testID} style={frame}>
        {body}
      </View>
    );

  return (
    <Pressable
      testID={testID}
      accessibilityRole={toggle ? "switch" : "button"}
      accessibilityLabel={accessibilityLabel ?? [label, description].filter(Boolean).join(", ")}
      accessibilityState={
        toggle ? { checked: toggle.value, disabled: off } : { disabled: off, busy: pending, selected }
      }
      disabled={off}
      onPress={act}
      style={({ hovered }) => [
        frame,
        selected
          ? { backgroundColor: colors["accent-soft"] }
          : hovered && !off
            ? { backgroundColor: colors.hover }
            : null,
      ]}
    >
      {body}
    </Pressable>
  );
}

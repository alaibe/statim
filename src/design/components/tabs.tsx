import { Text as RNText, ScrollView, View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon, type IconName } from "../icon";
import { desktop } from "../lib/platform";
import { Control, FontSize, Radius, Space } from "../tokens";
import { Pressable } from "./pressable";
import { Text, textStyle } from "./text";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: IconName;
  count?: number;
  testID?: string;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange(value: T): void;
}

/** Views of the same thing on a 1px `line` baseline; the current one is `fg` over a glowing 2px `accent` underline. */
export function Tabs<T extends string>({ items, value, onChange }: TabsProps<T>) {
  const colors = useThemeColors();
  return (
    <View style={{ height: Control.lg, borderBottomWidth: 1, borderColor: colors.line }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: desktop ? 0 : Space[1] }}
        accessibilityRole="tablist"
      >
        {items.map((item) => {
          const current = item.id === value;
          return (
            <Pressable
              key={item.id}
              testID={item.testID}
              accessibilityRole="tab"
              accessibilityState={{ selected: current }}
              accessibilityLabel={item.count ? `${item.label}, ${item.count}` : item.label}
              onPress={() => onChange(item.id)}
              style={{ height: Control.lg, paddingHorizontal: Space[3], justifyContent: "center" }}
            >
              {({ hovered }) => (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: Space[2] }}>
                    {item.icon ? <Icon name={item.icon} size={16} tone={current || hovered ? "fg" : "muted"} /> : null}
                    <Text variant="control" tone={current || hovered ? "fg" : "muted"}>
                      {item.label}
                    </Text>
                    {item.count ? (
                      <Text variant="meta" tone={current || hovered ? "fg" : "muted"}>
                        {item.count}
                      </Text>
                    ) : null}
                  </View>
                  {current ? (
                    <View
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: -1,
                        height: 2,
                        backgroundColor: colors.accent,
                        boxShadow: `0 0 8px ${colors.accent}`,
                      }}
                    />
                  ) : null}
                </>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const SEGMENT = { ...textStyle("control"), fontSize: FontSize.xs, lineHeight: FontSize.xs + 2 };

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string; testID?: string }[];
  value: T;
  onChange(value: T): void;
  accessibilityLabel?: string;
}

/** Two to four modes in one `line-strong` group, `md` radius; the selected one `accent-soft` with `fg` text. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const colors = useThemeColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{
        height: desktop ? Control.sm : Control.touch,
        flexDirection: "row",
        alignSelf: desktop ? "flex-start" : "stretch",
        borderWidth: 1,
        borderColor: colors["line-strong"],
        borderRadius: Radius.md,
        backgroundColor: colors.panel,
        overflow: "hidden",
      }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={option.testID}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={{
              flex: desktop ? undefined : 1,
              paddingHorizontal: Space[3],
              alignItems: "center",
              justifyContent: "center",
              borderLeftWidth: index === 0 ? 0 : 1,
              borderColor: colors.line,
              backgroundColor: selected ? colors["accent-soft"] : "transparent",
            }}
          >
            {({ hovered }) => (
              <RNText style={[SEGMENT, { color: selected || hovered ? colors.fg : colors.muted }]}>
                {option.label}
              </RNText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

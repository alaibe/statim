import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon, type IconName } from "../icon";
import { Control, Layout, Radius, Space } from "../tokens";
import { Badge } from "./avatar-and-badge";
import { Pressable } from "./pressable";
import { Text } from "./text";
import { Tooltip, useTooltip } from "./tooltip";

export interface Place {
  id: string;
  label: string;
  icon: IconName;
  /** A badge: `accent` for what waits for the person, `info` for the rest. */
  count?: number;
  countTone?: "accent" | "info";
  /** The dot, for news without a number. */
  news?: boolean;
  /** Its accessible name with the count, `Requests, 3 waiting`; the label alone by default. */
  name?: string;
  keys?: readonly string[];
  testID?: string;
}

interface SidebarItemProps {
  place: Place;
  current: boolean;
  onPress(): void;
  /** In place of the icon, such as the account's 20 square avatar. */
  children?: React.ReactNode;
}

/** A 32 square badge host, radius `md`, its name and shortcut in a tooltip beside it; the current place on `accent-soft` with the rail's 2px `accent` marker. */
export function SidebarItem({ place, current, onPress, children }: SidebarItemProps) {
  const colors = useThemeColors();
  const tooltip = useTooltip();
  const tip = place.count ? `${place.label} ${place.count}` : place.label;
  return (
    <Pressable
      testID={place.testID}
      accessibilityRole="link"
      accessibilityLabel={place.name ?? place.label}
      accessibilityState={{ selected: current }}
      aria-current={current ? "page" : undefined}
      onPress={onPress}
      {...tooltip.handlers}
      style={({ hovered }) => ({
        width: Control.md,
        height: Control.md,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Radius.md,
        backgroundColor: current ? colors["accent-soft"] : hovered ? colors.hover : "transparent",
      })}
    >
      {({ hovered }) => (
        <>
          {current ? (
            <View
              style={{
                position: "absolute",
                top: Space[1],
                bottom: Space[1],
                left: -Space[2],
                width: 2,
                backgroundColor: colors.accent,
              }}
            />
          ) : null}
          {children ?? <Icon name={place.icon} size={20} tone={current ? "accent" : hovered ? "fg" : "muted"} />}
          {place.count ? (
            <View aria-hidden style={{ position: "absolute", top: 0, right: -Space[1] }}>
              <Badge count={place.count} tone={place.countTone} ring={colors.side} />
            </View>
          ) : place.news ? (
            <View aria-hidden style={{ position: "absolute", top: Space[1], right: Space[1] }}>
              <Badge />
            </View>
          ) : null}
          {tooltip.shown ? <Tooltip label={tip} keys={place.keys} side="end" /> : null}
        </>
      )}
    </Pressable>
  );
}

/** Between groups of places: a 1px `line`, 24 wide; the rail's gap puts 4 above and below. */
export function SidebarGroup() {
  const colors = useThemeColors();
  return <View role="separator" style={{ width: Space[6], borderTopWidth: 1, borderColor: colors.line }} />;
}

/** The rail's foot: the account, then settings. */
export function SidebarEnd({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ marginTop: "auto", paddingTop: Space[2], alignItems: "center", gap: Space[1] }}>{children}</View>
  );
}

/** The desktop's places: a 48 rail on `side`, items 4 apart, a 1px `line` on its right; the app's flat icon heads it. */
export function Sidebar({ app, children }: { app?: React.ReactNode; children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <View
      role="navigation"
      aria-label="Places"
      style={{
        flex: 1,
        width: Layout.sidebar,
        alignItems: "center",
        gap: Space[1],
        paddingBottom: Space[2],
        backgroundColor: colors.side,
        borderRightWidth: 1,
        borderColor: colors.line,
      }}
    >
      <View style={{ height: Space[12], alignItems: "center", justifyContent: "center" }}>{app}</View>
      {children}
    </View>
  );
}

interface TabBarProps {
  places: readonly Place[];
  current: string;
  onPress(id: string): void;
}

/** The phone's places: 56 plus the safe area on `side`, Lucide 24 and mono `2xs` labels, `accent` for the current. */
export function TabBar({ places, current, onPress }: TabBarProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        height: Layout.tabbar + insets.bottom,
        paddingBottom: insets.bottom,
        flexDirection: "row",
        backgroundColor: colors.side,
        borderTopWidth: 1,
        borderColor: colors.line,
      }}
    >
      {places.map((place) => {
        const on = place.id === current;
        return (
          <Pressable
            key={place.id}
            testID={place.testID}
            accessibilityRole="tab"
            accessibilityLabel={place.label}
            accessibilityState={{ selected: on }}
            onPress={() => onPress(place.id)}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: Space[1] }}
          >
            <View>
              <Icon name={place.icon} size={24} tone={on ? "accent" : "muted"} />
              {place.news ? (
                <View style={{ position: "absolute", top: -2, right: -4 }}>
                  <Badge />
                </View>
              ) : null}
            </View>
            <Text variant="label" tone={on ? "accent" : "muted"}>
              {place.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

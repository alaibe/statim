import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon, type IconName } from "../icon";
import { Control, Layout, Radius, Space } from "../tokens";
import { Badge } from "./avatar-and-badge";
import { shortcutText } from "./keycap";
import { Pressable } from "./pressable";
import { Text } from "./text";

export interface Place {
  id: string;
  label: string;
  icon: IconName;
  /** Plain text on the right, in `accent` when there is news. */
  count?: number;
  news?: boolean;
  keys?: readonly string[];
  testID?: string;
}

interface SidebarItemProps {
  place: Place;
  current: boolean;
  collapsed?: boolean;
  onPress(): void;
}

/** Height 28, radius `md`; the current place on `accent-soft` with its icon and count in `accent`. */
export function SidebarItem({ place, current, collapsed = false, onPress }: SidebarItemProps) {
  const colors = useThemeColors();
  const lit = current || place.news;
  return (
    <Pressable
      testID={place.testID}
      accessibilityRole="link"
      accessibilityLabel={place.keys ? `${place.label}, ${shortcutText(place.keys)}` : place.label}
      accessibilityState={{ selected: current }}
      onPress={onPress}
      style={({ hovered }) => ({
        height: Control.sm,
        marginHorizontal: Space[2],
        paddingHorizontal: Space[2],
        flexDirection: "row",
        alignItems: "center",
        justifyContent: collapsed ? "center" : undefined,
        gap: Space[2],
        borderRadius: Radius.md,
        backgroundColor: current ? colors["accent-soft"] : hovered ? colors.hover : "transparent",
      })}
    >
      <Icon name={place.icon} size={16} tone={current ? "accent" : "muted"} />
      {collapsed ? null : (
        <>
          <Text variant="control" numberOfLines={1} style={{ flex: 1 }}>
            {place.label}
          </Text>
          {place.count ? (
            <Text variant="meta" tone={lit ? "accent" : "muted"}>
              {place.count}
            </Text>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/** A group's label: mono 11 uppercase in `muted`, 16 above and 4 below. */
export function SidebarGroup({ label }: { label: string }) {
  return (
    <View style={{ paddingTop: Space[4], paddingHorizontal: Space[4], paddingBottom: Space[1] }}>
      <Text variant="label">{label}</Text>
    </View>
  );
}

/** The desktop's places: `side`, 232 wide (48 collapsed), a 1px `line` on its right. */
export function Sidebar({ collapsed = false, children }: { collapsed?: boolean; children: React.ReactNode }) {
  const colors = useThemeColors();
  return (
    <View
      role="navigation"
      aria-label="Places"
      style={{
        width: collapsed ? Layout["sidebar-collapsed"] : Layout.sidebar,
        paddingBottom: Space[3],
        backgroundColor: colors.side,
        borderRightWidth: 1,
        borderColor: colors.line,
      }}
    >
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

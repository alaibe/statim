import { View } from "react-native";
import { coordinatesLabel, type Location } from "@/core/messaging/locations";
import { Icon, Pressable, Radius, Text, useThemeColors } from "@/design";
import { openInMaps } from "./link-actions";

export function LocationCard({ location }: { location: Location; fromMe: boolean }) {
  const colors = useThemeColors();
  const coordinates = coordinatesLabel(location);
  const title = location.label ?? coordinates ?? "Shared place";

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}. Open in Maps`}
      onPress={() => {
        openInMaps(location.url).catch(() => {});
      }}
      className="mt-1.5 flex-row items-center gap-2.5 px-2 py-1.5"
      style={({ hovered }) => ({
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: hovered ? colors.hover : "transparent",
      })}
    >
      <Icon name="map-pin" size={20} tone="accent" />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={2} strong>
          {title}
        </Text>
        <Text variant="meta" numberOfLines={1}>
          {location.label && coordinates ? `${coordinates} · Open in Maps` : "Open in Maps"}
        </Text>
      </View>
      <Icon name="arrow-up-right" size={16} tone="muted" />
    </Pressable>
  );
}

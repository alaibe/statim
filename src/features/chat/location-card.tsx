import { View } from "react-native";
import { coordinatesLabel, type Location } from "@/core/messaging/locations";
import { cn, Icon, Pressable, Text } from "@/design";
import { openInMaps } from "./link-actions";

export function LocationCard({ location, fromMe }: { location: Location; fromMe: boolean }) {
  const coordinates = coordinatesLabel(location);
  const title = location.label ?? coordinates ?? "Shared place";

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${title}. Open in Maps`}
      onPress={() => {
        openInMaps(location.url).catch(() => {});
      }}
      className={cn("mt-1.5 flex-row items-center gap-2.5 rounded-md px-2 py-1.5", fromMe ? "bg-fg/15" : "bg-fg/5")}
      style={{ borderCurve: "continuous" }}
    >
      <Icon name="location-outline" size={22} tone={fromMe ? "fg" : "accent"} />
      <View className="min-w-0 flex-1">
        <Text variant="footnote" numberOfLines={2} className={cn("font-semibold", fromMe ? "text-fg" : "text-fg")}>
          {title}
        </Text>
        <Text variant="caption" numberOfLines={1} className={fromMe ? "text-fg/80" : undefined}>
          {location.label && coordinates ? `${coordinates} · Open in Maps` : "Open in Maps"}
        </Text>
      </View>
    </Pressable>
  );
}

import { View } from "react-native";
import { Icon, type IconName, Pressable, Radius, Text, useThemeColors } from "@/design";
import { openUrlQuietly } from "../link-actions";
import { formatBytes } from "./format";

interface FileBubbleProps {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  fromMe: boolean;
}

function iconFor(name: string, mimeType?: string): IconName {
  const type = mimeType ?? "";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "music";
  if (type === "application/pdf" || ext === "pdf") return "file-text";
  if (["zip", "gz", "tar", "rar", "7z"].includes(ext)) return "inbox";
  return "file";
}

export function FileBubble({ uri, name, mimeType, size, fromMe }: FileBubbleProps) {
  const colors = useThemeColors();

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}`} onPress={() => openUrlQuietly(uri)}>
      <View className="flex-row items-center gap-3 py-0.5" style={{ minWidth: 180 }}>
        <View
          className="h-10 w-10 items-center justify-center"
          style={{ borderRadius: Radius.sm, backgroundColor: fromMe ? colors.bg : colors.hover }}
        >
          <Icon name={iconFor(name, mimeType)} size={20} tone="muted" />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1}>{name}</Text>
          {size !== undefined ? <Text variant="meta">{formatBytes(size)}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

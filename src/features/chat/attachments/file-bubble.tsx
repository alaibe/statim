import { View } from "react-native";
import { Icon, type IconName, Pressable, Text, useThemeColors } from "@/design";
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
  const tint = fromMe ? colors["fg"] : colors.accent;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}`}
      onPress={() => openUrlQuietly(uri)}
      pressScale={0.99}
    >
      <View className="min-w-[180px] flex-row items-center gap-3 py-0.5">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-side">
          <Icon name={iconFor(name, mimeType)} size={20} color={tint} />
        </View>
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className={fromMe ? "font-medium text-fg" : "font-medium text-fg"}>
            {name}
          </Text>
          {size !== undefined ? (
            <Text variant="caption" className={fromMe ? "text-fg/70" : undefined}>
              {formatBytes(size)}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

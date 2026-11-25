import { Text as RNText, View } from "react-native";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Radius, Size, Space, withAlpha } from "../tokens";
import { textStyle } from "./text";

/** `ok` `warn` `err` `info` are statuses with their word; `accent` is the app's own (`LIVE`, `NEW`); `category` is neutral. */
export type TagTone = "ok" | "warn" | "err" | "info" | "accent" | "category";

const STATUS = { ok: "success", warn: "warning", err: "danger", info: "info" } as const;

/** The word a status tag says when the caller gives none. */
export const STATUS_WORD = { ok: "OK", warn: "WARN", err: "ERR", info: "INFO" } as const;

interface TagProps {
  tone?: TagTone;
  /** The word: a status (`OK`, `ERR`, `LIVE`, `DRAFT`) or a category, three words at most. */
  label?: string;
  /** `LIVE`'s glowing dot. */
  dot?: boolean;
}

const TAG_TEXT = { ...textStyle("label"), letterSpacing: 0.06 * 11 };

export function Tag({ tone = "category", label, dot = false }: TagProps) {
  const colors = useThemeColors();
  const word = label ?? (tone in STATUS_WORD ? STATUS_WORD[tone as keyof typeof STATUS_WORD] : "");
  const status = tone in STATUS ? colors[STATUS[tone as keyof typeof STATUS]] : null;
  const color = status ?? (tone === "accent" ? colors.accent : colors.muted);

  return (
    <View
      style={{
        height: Space[5],
        paddingHorizontal: Space[1],
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        alignSelf: "flex-start",
        borderRadius: Radius.sm,
        borderWidth: 1,
        borderColor: status ?? "transparent",
        backgroundColor: status ? withAlpha(status, 0.12) : tone === "accent" ? colors["accent-soft"] : colors.hover,
      }}
    >
      {dot ? (
        <View
          style={{
            width: Size.dot,
            height: Size.dot,
            borderRadius: Radius.full,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      ) : null}
      <RNText numberOfLines={1} style={[TAG_TEXT, { color }]}>
        {word}
      </RNText>
    </View>
  );
}

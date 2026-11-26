import { Image } from "expo-image";
import { Text as RNText, View } from "react-native";

import { useLoadableUri } from "@/lib/loadable-uri";

import { useThemeColors } from "../hooks/use-theme-colors";
import { Icon, type IconName } from "../icon";
import { Radius } from "../tokens";
import { textStyle } from "./text";

/** 16 inline, 20 in rows, 28 in headers, 40 in chat lists and profiles; 64 heads a profile page on a phone. */
export type AvatarSize = 16 | 20 | 28 | 40 | 64;

export interface AvatarProps {
  size?: AvatarSize;
  /** A circle for a person; a square for an agent, a plugin or an account, so the two never get confused. */
  shape?: "circle" | "square";
  label?: string;
  image?: number | string;
  emoji?: string;
  /** An agent's or a plugin's mark, in place of initials. */
  icon?: IconName;
  presence?: "online" | "away";
  /** The surface it sits on, for the presence dot's ring; `bg` by default. */
  ring?: string;
}

/** Initials are one or two letters: a name's first two words, its first two characters, or an address's after `0x`. */
export function initialsOf(label: string): string {
  const address = /^0x([0-9a-f]{2})/i.exec(label.trim());
  if (address) return address[1].toUpperCase();
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${[...words[0]][0]}${[...words[1]][0]}`.toUpperCase();
  return [...(words[0] ?? "")].slice(0, 2).join("").toUpperCase();
}

/** An image when there is one, otherwise initials in `muted` on `hover`: a list of avatars stays ink. */
export function Avatar({ size = 40, shape = "circle", label, image, emoji, icon, presence, ring }: AvatarProps) {
  const colors = useThemeColors();
  const loaded = useLoadableUri(typeof image === "string" ? image : "");
  const radius = shape === "square" ? Radius.sm : size / 2;
  const name = label ? `Avatar for ${label}` : "Avatar";
  const box = { width: size, height: size, borderRadius: radius };

  let face: React.ReactNode;
  if (typeof image === "number" || (image !== undefined && loaded)) {
    face = (
      <Image
        accessibilityRole="image"
        accessibilityLabel={name}
        source={typeof image === "string" ? { uri: loaded ?? image } : image}
        recyclingKey={typeof image === "string" ? image : undefined}
        cachePolicy="memory-disk"
        contentFit="cover"
        style={box}
      />
    );
  } else {
    face = (
      <View
        accessibilityRole="image"
        accessibilityLabel={name}
        style={[box, { alignItems: "center", justifyContent: "center", backgroundColor: colors.hover }]}
      >
        {emoji ? (
          <RNText style={{ fontSize: size * 0.55, lineHeight: size * 0.75 }}>{emoji}</RNText>
        ) : icon ? (
          <Icon name={icon} size={size >= 40 ? 24 : size >= 28 ? 16 : 16} tone="muted" />
        ) : (
          <RNText
            style={[
              textStyle("control", { strong: true }),
              { fontSize: Math.round(size * 0.4), lineHeight: Math.round(size * 0.5), color: colors.muted },
            ]}
          >
            {label ? initialsOf(label) : ""}
          </RNText>
        )}
      </View>
    );
  }

  if (!presence) return face;
  const dot = Math.round(size * 0.3);
  return (
    <View style={{ width: size, height: size }}>
      {face}
      <View
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: dot,
          height: dot,
          borderRadius: Radius.full,
          backgroundColor: presence === "online" ? colors.success : colors.subtle,
          boxShadow: `0 0 0 2px ${ring ?? colors.bg}`,
        }}
      />
    </View>
  );
}

interface BadgeProps {
  /** A count; none draws the 6px dot that means "new". */
  count?: number;
  /** Unread or waiting for the person in `accent`; informational in `hover` and `muted`. */
  tone?: "accent" | "info";
  /** The surface it sits on, for its 2px ring; `bg` by default. */
  ring?: string;
}

/** On an icon or an avatar, the sidebar's included, top right; lists show counts as plain text instead. */
export function Badge({ count, tone = "accent", ring }: BadgeProps) {
  const colors = useThemeColors();
  if (!count) {
    return (
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: Radius.full,
          backgroundColor: colors.accent,
          boxShadow: `0 0 6px ${colors.accent}`,
        }}
      />
    );
  }
  return (
    <View
      style={{
        minWidth: 16,
        height: 16,
        paddingHorizontal: 4,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: Radius.full,
        backgroundColor: tone === "accent" ? colors.accent : colors.hover,
        boxShadow: `0 0 0 2px ${ring ?? colors.bg}`,
      }}
    >
      <RNText
        style={[
          textStyle("meta", { strong: true }),
          { fontSize: 11, lineHeight: 16, color: tone === "accent" ? colors["on-accent"] : colors.muted },
        ]}
      >
        {count > 99 ? "99+" : count}
      </RNText>
    </View>
  );
}

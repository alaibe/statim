import { useState } from "react";
import { Text as RNText, View } from "react-native";

import { cn, Pressable, Radius, Text, useThemeColors } from "@/design";

export function ReactionRow({
  reactions,
  fromMe,
  inBubble,
  selfId,
  nameFor,
  onReact,
}: {
  reactions: Readonly<Record<string, readonly string[]>>;
  fromMe: boolean;
  inBubble: boolean;
  selfId: string;
  nameFor: (id: string) => string;
  onReact?: (emoji: string) => void;
}) {
  return (
    <View className={cn("flex-row flex-wrap gap-1", !inBubble && "mt-1", fromMe && !inBubble && "justify-end")}>
      {Object.entries(reactions).map(([emoji, people]) => (
        <Reaction
          key={emoji}
          emoji={emoji}
          people={people}
          mine={people.includes(selfId)}
          names={people.map((id) => (id === selfId ? "You" : nameFor(id)))}
          onPress={onReact && (() => onReact(emoji))}
        />
      ))}
    </View>
  );
}

/** A small tag: `hover` fill, `accent-soft` with an `accent` edge when it is yours, the count in mono. */
function Reaction({
  emoji,
  people,
  mine,
  names,
  onPress,
}: {
  emoji: string;
  people: readonly string[];
  mine: boolean;
  names: string[];
  onPress?: () => void;
}) {
  const colors = useThemeColors();
  const [hovered, setHovered] = useState(false);
  const who = names.join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${emoji} from ${who}`}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      className="relative flex-row items-center gap-1 px-1.5 py-0.5"
      style={{
        borderRadius: Radius.sm,
        borderWidth: 1,
        borderColor: mine ? colors.accent : "transparent",
        backgroundColor: mine ? colors["accent-soft"] : colors.hover,
      }}
    >
      <RNText style={{ fontSize: 13, lineHeight: 18 }}>{emoji}</RNText>
      {people.length > 1 ? (
        <Text variant="meta" tone={mine ? "accent" : "muted"}>
          {people.length}
        </Text>
      ) : null}
      {hovered ? (
        <View
          className="absolute bottom-full left-0 z-10 mb-2 px-2 py-1"
          style={{
            borderRadius: Radius.sm,
            borderWidth: 1,
            borderColor: colors["line-strong"],
            backgroundColor: colors.void,
          }}
        >
          <Text variant="meta" tone="fg" numberOfLines={1}>
            {who}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

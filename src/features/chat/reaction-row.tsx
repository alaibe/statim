import { useState } from "react";
import { Pressable, View } from "react-native";

import { cn, Text } from "@/design";

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
          fromMe={fromMe}
          inBubble={inBubble}
          names={people.map((id) => (id === selfId ? "You" : nameFor(id)))}
          onPress={onReact && (() => onReact(emoji))}
        />
      ))}
    </View>
  );
}

function Reaction({
  emoji,
  people,
  mine,
  fromMe,
  inBubble,
  names,
  onPress,
}: {
  emoji: string;
  people: readonly string[];
  mine: boolean;
  fromMe: boolean;
  inBubble: boolean;
  names: string[];
  onPress?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const who = names.join(", ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${emoji} from ${who}`}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      className={cn(
        "relative flex-row items-center gap-1 rounded-full px-2 py-0.5",
        !inBubble ? "bg-side" : mine ? (fromMe ? "bg-fg/25" : "bg-accent") : fromMe ? "bg-fg/10" : "bg-accent/10",
      )}
    >
      <Text variant="caption">{emoji}</Text>
      {people.length > 1 ? (
        <Text
          variant="micro"
          className={cn(
            "font-semibold tabular-nums",
            inBubble && mine && !fromMe ? "text-on-accent" : fromMe ? "text-fg" : "text-accent",
          )}
        >
          {people.length}
        </Text>
      ) : null}
      {hovered ? (
        <View className="absolute bottom-full left-0 z-10 mb-1 rounded-md bg-fg px-2 py-1">
          <Text variant="micro" className="whitespace-nowrap text-bg">
            {who}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

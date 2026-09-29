import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { cn, Text } from '@/design';

export interface Reactors {
  nameOf(id: string): string;
  selfId?: string;
}

export function ReactionRow({
  reactions,
  fromMe,
  inBubble,
  reactors,
  onReact,
}: {
  reactions: Readonly<Record<string, readonly string[]>>;
  fromMe: boolean;
  inBubble: boolean;
  reactors?: Reactors;
  onReact?: (emoji: string) => void;
}) {
  return (
    <View
      className={cn(
        'flex-row flex-wrap gap-1',
        inBubble ? 'mt-1.5' : 'mt-1',
        fromMe && !inBubble && 'justify-end'
      )}>
      {Object.entries(reactions).map(([emoji, people]) => (
        <Reaction
          key={emoji}
          emoji={emoji}
          people={people}
          mine={!!reactors?.selfId && people.includes(reactors.selfId)}
          fromMe={fromMe}
          inBubble={inBubble}
          names={people.map((id) =>
            id === reactors?.selfId ? 'You' : (reactors?.nameOf(id) ?? id)
          )}
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
  const who = names.join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${emoji} from ${who}`}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      className={cn(
        'relative flex-row items-center gap-1 rounded-pill px-2 py-0.5',
        !inBubble
          ? 'bg-surface-sunken'
          : mine
            ? fromMe
              ? 'bg-bubble-out-on/25'
              : 'bg-brand'
            : fromMe
              ? 'bg-bubble-out-on/10'
              : 'bg-brand/10'
      )}>
      <Text variant="caption">{emoji}</Text>
      {people.length > 1 ? (
        <Text
          variant="micro"
          className={cn(
            'font-semibold tabular-nums',
            inBubble && mine && !fromMe
              ? 'text-brand-on'
              : fromMe
                ? 'text-bubble-out-on'
                : 'text-brand'
          )}>
          {people.length}
        </Text>
      ) : null}
      {hovered ? (
        <View className="absolute bottom-full left-0 z-10 mb-1 rounded-md bg-content px-2 py-1">
          <Text variant="micro" className="whitespace-nowrap text-canvas">
            {who}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

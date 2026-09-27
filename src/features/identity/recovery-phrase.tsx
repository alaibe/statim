import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Card, Enter, Icon, Pressable, Text } from '@/design';

function RecoveryPhrase({ phrase }: { phrase: string }) {
  const words = phrase.split(' ');

  return (
    <View className="flex-row flex-wrap gap-2">
      {words.map((word, i) => (
        <View
          key={`${word}-${i}`}
          className="min-w-[30%] flex-1 flex-row items-baseline gap-1.5 rounded-field bg-surface-sunken px-2.5 py-2">
          <Text variant="micro" className="shrink-0 tabular-nums">
            {i + 1}
          </Text>
          <Text className="min-w-0 text-footnote font-medium">{word}</Text>
        </View>
      ))}
    </View>
  );
}

/** The phrase behind a tap, with `children` shown under it once it is revealed. */
export function RevealablePhrase({
  phrase,
  revealed,
  onReveal,
  children,
}: {
  phrase: string;
  revealed: boolean;
  onReveal: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Card className="gap-3">
      {revealed ? (
        <Animated.View entering={Enter.fade()}>
          <RecoveryPhrase phrase={phrase} />
        </Animated.View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reveal recovery phrase"
          onPress={onReveal}
          className="items-center justify-center gap-1 rounded-field bg-surface-sunken py-10">
          <Icon name="eye-outline" size={20} tone="muted" />
          <Text variant="title">Tap to reveal</Text>
          <Text variant="caption">Make sure nobody is looking over your shoulder</Text>
        </Pressable>
      )}
      {revealed ? children : null}
    </Card>
  );
}

import { View } from "react-native";
import Animated from "react-native-reanimated";

import { Enter, Icon, Pressable, Radius, Section, Text, useThemeColors } from "@/design";

/** Twelve or twenty-four words in mono, numbered, on `hover` cells. */
function RecoveryPhrase({ phrase }: { phrase: string }) {
  const colors = useThemeColors();
  const words = phrase.split(" ");

  return (
    <View className="flex-row flex-wrap gap-2">
      {words.map((word, i) => (
        <View
          key={`${word}-${i}`}
          className="flex-1 flex-row items-baseline gap-2 px-3 py-2"
          style={{ minWidth: "30%", borderRadius: Radius.sm, backgroundColor: colors.hover }}
        >
          <Text variant="meta">{i + 1}</Text>
          <Text variant="code" className="min-w-0">
            {word}
          </Text>
        </View>
      ))}
    </View>
  );
}

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
  const colors = useThemeColors();
  return (
    <Section raised>
      <View className="gap-3">
        {revealed ? (
          <Animated.View entering={Enter.fade()}>
            <RecoveryPhrase phrase={phrase} />
          </Animated.View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reveal recovery phrase"
            onPress={onReveal}
            className="items-center justify-center gap-1 py-10"
            style={({ hovered, pressed }) => ({
              borderRadius: Radius.md,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: colors["line-strong"],
              backgroundColor: hovered || pressed ? colors.hover : "transparent",
            })}
          >
            <Icon name="eye" size={20} tone="muted" />
            <Text variant="control">Tap to reveal</Text>
            <Text size="sm" tone="muted">
              Make sure nobody is looking over your shoulder
            </Text>
          </Pressable>
        )}
        {revealed ? children : null}
      </View>
    </Section>
  );
}

import { useSegments } from "expo-router";
import { Fragment } from "react";
import { View } from "react-native";

import { Text } from "@/design";

type Hint = { keys: string[]; action: string };

// The design system's status bar: the lit point and the app on the left, the keys for what you're doing on the right.
function hintsFor(segments: readonly string[]): Hint[] {
  if (segments[0] === "chat" || segments[0] === "thread") {
    return [
      { keys: ["↵"], action: "send" },
      { keys: ["↑"], action: "edit last" },
      { keys: ["⌘", "K"], action: "switch chat" },
    ];
  }
  if (segments[0] === "search") {
    return [
      { keys: ["↵"], action: "open" },
      { keys: ["Esc"], action: "close" },
    ];
  }
  return [
    { keys: ["⌘", "K"], action: "switch" },
    { keys: ["⌘", "N"], action: "new chat" },
    { keys: ["⌘", "F"], action: "search" },
    { keys: ["⌘", ","], action: "settings" },
  ];
}

function Key({ label }: { label: string }) {
  return (
    <View className="h-4 min-w-4 items-center justify-center rounded-sm border border-b-2 border-line-strong bg-bg px-1">
      <Text variant="mono" className="text-[10px] leading-none text-muted">
        {label}
      </Text>
    </View>
  );
}

export function StatusBar() {
  const segments = useSegments();
  const hints = hintsFor(segments);
  return (
    <View className="h-6 flex-row items-center gap-2 border-t border-line bg-side px-3">
      <View className="h-1.5 w-1.5 rounded-full bg-accent" style={{ boxShadow: "0 0 8px rgb(var(--color-accent))" }} />
      <Text variant="micro" className="text-fg">
        Statim
      </Text>
      <View className="flex-1" />
      {hints.map((hint, index) => (
        <Fragment key={hint.action}>
          {index > 0 ? (
            <Text variant="mono" className="text-[11px] text-subtle">
              ·
            </Text>
          ) : null}
          <View className="flex-row items-center gap-1">
            {hint.keys.map((key) => (
              <Key key={key} label={key} />
            ))}
            <Text variant="mono" className="text-[11px] text-muted">
              {hint.action}
            </Text>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

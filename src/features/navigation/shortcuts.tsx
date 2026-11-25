import { ScrollView, View } from "react-native";

import { Keys, Sheet, Text } from "@/design";

import { COMMANDS, type Command, useOverlays } from "./commands";

const GROUPS: Command["group"][] = ["Actions", "Chat", "Go to", "Window"];

/** `?`: every shortcut, from the same registry the keys run on. */
export function ShortcutsOverlay() {
  const open = useOverlays((s) => s.shortcuts);
  const close = () => useOverlays.getState().set({ shortcuts: false });

  return (
    <Sheet visible={open} onClose={close} label="Keyboard" title="Shortcuts">
      <ScrollView style={{ maxHeight: 480 }}>
        {GROUPS.map((group) => {
          const keyed = COMMANDS.filter((command) => command.group === group && command.keys);
          return (
            <View key={group} className="pb-4">
              <View className="pb-1">
                <Text variant="label">{group}</Text>
              </View>
              {keyed.map((command) => (
                <View key={command.id} className="flex-row items-center justify-between gap-4 py-1">
                  <Text size="sm">{command.label}</Text>
                  <Keys keys={command.keys ?? []} sequence={command.sequence} />
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

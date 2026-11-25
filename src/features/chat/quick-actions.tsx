import { useSyncExternalStore } from "react";
import { ScrollView } from "react-native";
import Animated from "react-native-reanimated";
import { parseCommand } from "@/core/commands/parser";
import type { ChatScope } from "@/core/messaging/chat-scope";
import type { ChatId } from "@/core/messaging/types";
import { usePluginHost } from "@/core/plugins/host";
import { worksOn } from "@/core/plugins/registry";
import type { ComposerAction } from "@/core/plugins/types";
import { Enter, Exit, Icon, Pressable, Radius, Text, useThemeColors } from "@/design";

import { useChatSession } from "./use-chat-permissions";

export function QuickActions({
  chatId,
  scope,
  hasDraft,
  suggestedId,
  onRun,
}: {
  chatId: ChatId;
  scope: ChatScope;
  hasDraft: boolean;
  suggestedId?: string;
  onRun: (action: ComposerAction) => void;
}) {
  const colors = useThemeColors();
  const { registry } = usePluginHost();
  const session = useChatSession(chatId);
  const offered = useSyncExternalStore(
    registry.subscribe,
    () => registry.composerActionsFor(chatId, scope),
    () => registry.composerActionsFor(chatId, scope),
  );
  const commands = registry.commandsFor(chatId, scope);
  const actions = offered.filter(({ action }) => {
    if (action.takesDraft && !hasDraft) return false;
    const entry = commands.get(parseCommand(action.command)?.name ?? "");
    return !entry || worksOn(entry.command, session);
  });

  if (actions.length === 0) return null;
  return (
    <Animated.View entering={Enter.fade()} exiting={Exit.fade()}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2 px-4 pb-2"
      >
        {actions.map(({ action }) => {
          const suggested = action.id === suggestedId;
          return (
            <Pressable
              key={action.id}
              testID={`quick-${action.id}`}
              accessibilityRole="button"
              accessibilityLabel={suggested ? `${action.label}, suggested by Jev` : action.label}
              onPress={() => onRun(action)}
              className="flex-row items-center gap-2 px-3"
              style={({ hovered }) => ({
                height: 32,
                borderRadius: Radius.md,
                borderWidth: 1,
                borderColor: suggested ? colors.accent : colors["line-strong"],
                backgroundColor: suggested ? colors["accent-soft"] : hovered ? colors.hover : colors.panel,
              })}
            >
              <Icon name={action.icon} size={16} tone="muted" />
              <Text variant="control">{action.label}</Text>
              {suggested ? <Text variant="meta">Suggested</Text> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

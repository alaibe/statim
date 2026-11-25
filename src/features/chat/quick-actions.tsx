import { useSyncExternalStore } from "react";
import { ScrollView } from "react-native";
import Animated from "react-native-reanimated";
import { parseCommand } from "@/core/commands/parser";
import type { ChatScope } from "@/core/messaging/chat-scope";
import type { ChatId } from "@/core/messaging/types";
import { usePluginHost } from "@/core/plugins/host";
import { worksOn } from "@/core/plugins/registry";
import type { ComposerAction } from "@/core/plugins/types";
import { cn, Enter, Exit, Icon, Pressable, Text } from "@/design";

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
              className={cn(
                "flex-row items-center gap-1.5 rounded-full border px-3 py-1.5",
                suggested ? "border-accent bg-accent-soft" : "border-line bg-panel",
              )}
            >
              <Icon name={action.icon} size={16} tone="accent" />
              <Text variant="caption" className="font-medium text-fg">
                {action.label}
                {suggested ? " · Suggested" : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

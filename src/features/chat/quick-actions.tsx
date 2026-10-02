import { useSyncExternalStore } from 'react';
import { ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';

import { Enter, Exit, Icon, Pressable, Text } from '@/design';
import { parseCommand } from '@/core/commands/parser';
import type { ChatScope } from '@/core/messaging/chat-scope';
import type { ChatId } from '@/core/messaging/types';
import { usePluginHost } from '@/core/plugins/host';
import type { ComposerAction } from '@/core/plugins/types';
import { worksOn } from '@/core/plugins/registry';

import { useSupports } from './use-supports';

/** The buttons plugins offer above the composer, minus those whose command this protocol lacks. */
export function QuickActions({
  chatId,
  scope,
  hasDraft,
  onRun,
}: {
  chatId: ChatId;
  scope: ChatScope;
  hasDraft: boolean;
  onRun: (action: ComposerAction) => void;
}) {
  const { registry } = usePluginHost();
  const { session } = useSupports(chatId);
  const offered = useSyncExternalStore(
    registry.subscribe,
    () => registry.composerActionsFor(chatId, scope),
    () => registry.composerActionsFor(chatId, scope)
  );
  const commands = registry.commandsFor(chatId, scope);
  const actions = offered.filter(({ action }) => {
    if (action.takesDraft && !hasDraft) return false;
    const entry = commands.get(parseCommand(action.command)?.name ?? '');
    return !entry || worksOn(entry.command, session);
  });

  if (actions.length === 0) return null;
  return (
    <Animated.View entering={Enter.fade()} exiting={Exit.fade()}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2 px-gutter pb-2">
        {actions.map(({ action }) => (
          <Pressable
            key={action.id}
            testID={`quick-${action.id}`}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            onPress={() => onRun(action)}
            className="flex-row items-center gap-1.5 rounded-pill border border-line bg-surface-raised px-3 py-1.5">
            <Icon name={action.icon} size={14} tone="brand" />
            <Text variant="caption" className="font-medium text-content">
              {action.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

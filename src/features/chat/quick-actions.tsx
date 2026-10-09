import { useSyncExternalStore } from 'react';
import { ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';

import { cn, Enter, Exit, Icon, Pressable, Text } from '@/design';
import { parseCommand } from '@/core/commands/parser';
import type { ChatScope } from '@/core/messaging/chat-scope';
import type { ChatId } from '@/core/messaging/types';
import { usePluginHost } from '@/core/plugins/host';
import type { ComposerAction } from '@/core/plugins/types';
import { worksOn } from '@/core/plugins/registry';

import { useChatSession } from './use-chat-permissions';

/** The buttons plugins offer above the composer, minus those whose command this protocol lacks. */
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
                'flex-row items-center gap-1.5 rounded-pill border px-3 py-1.5',
                suggested ? 'border-brand bg-brand-soft' : 'border-line bg-surface-raised'
              )}>
              <Icon name={action.icon} size={14} tone="brand" />
              <Text variant="caption" className="font-medium text-content">
                {action.label}
                {suggested ? ' · Suggested' : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

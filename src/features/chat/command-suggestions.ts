import { commandNamePrefix, isTypingCommandName } from '@/core/commands/parser';
import type { SlashCommand } from '@/core/plugins/types';

export function commandSuggestions<T extends { command: SlashCommand }>(
  value: string,
  commands: T[]
) {
  const commandNames = commands.flatMap(({ command }) => [
    command.name,
    ...(command.aliases ?? []),
  ]);
  const prefix = isTypingCommandName(value) ? commandNamePrefix(value) : null;
  const suggestions =
    prefix === null
      ? []
      : commands.filter(
          ({ command }) =>
            command.name.startsWith(prefix) ||
            command.aliases?.some((alias) => alias.startsWith(prefix))
        );
  return { suggestions, commandNames };
}

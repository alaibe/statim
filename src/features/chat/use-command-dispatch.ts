import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { buttonCommand } from '@/core/commands/button';
import { parseCommand } from '@/core/commands/parser';
import { toast } from '@/design';
import { isLocalChat, toContent } from '@/core/messaging/bots';
import { inScope, type ChatScope } from '@/core/messaging/chat-scope';
import { useChatStore } from '@/core/messaging/chat-store';
import type { ChatId, MessageContent } from '@/core/messaging/types';
import { usePluginHost } from '@/core/plugins/host';
import { worksOn } from '@/core/plugins/registry';
import { errorMessage } from '@/core/errors';

import { useSupports } from './use-supports';

async function respondIn(chatId: ChatId, content: MessageContent | string) {
  const body = toContent(content);
  const chat = useChatStore.getState();
  if (isLocalChat(chatId)) await chat.postLocalMessage(chatId, body, 'bot');
  else await chat.postPrivateMessage(chatId, body);
}

const CONVERSATIONS: Record<Exclude<ChatScope, 'channel'>, string> = { dm: 'DMs', group: 'groups' };

/** Why a command that `home` contributes does not run in this chat. */
export function elsewhereMessage(
  name: string,
  showIn: readonly ChatScope[] | undefined,
  scope: ChatScope,
  home: string
): string {
  const places = (showIn ?? []).flatMap((s) => (s === 'channel' ? [] : [CONVERSATIONS[s]]));
  return !inScope(showIn, scope) && places.length > 0
    ? `/${name} works in ${places.join(' and ')}.`
    : `/${name} belongs to ${home}. Open that chat to use it.`;
}

export interface CommandDispatchOptions {
  chatId: ChatId;
  scope: ChatScope;
  onSendText(text: string): Promise<string>;
  setDraft(text: string): void;
  onRunningChange(label: string | null): void;
  pendingCommand: string | null;
  onPendingCommandHandled(): void;
}

export function useCommandDispatch({
  chatId,
  scope,
  onSendText,
  setDraft,
  onRunningChange,
  pendingCommand,
  onPendingCommandHandled,
}: CommandDispatchOptions) {
  const { registry } = usePluginHost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { session } = useSupports(chatId);
  const commands = useSyncExternalStore(
    registry.subscribe,
    () => registry.commandListFor(chatId, scope),
    () => registry.commandListFor(chatId, scope)
  ).filter(({ command }) => worksOn(command, session));

  const dispatch = useCallback(
    async (raw: string, from: 'typed' | 'action' = 'typed') => {
      const text = raw.trim();
      if (!text) return;
      const respond = (content: MessageContent | string) => respondIn(chatId, content);
      setError(null);

      if (from === 'action') {
        const button = buttonCommand(raw);
        if (button.kind === 'draft') return setDraft(button.text);
        if (button.kind === 'reply') {
          await onSendText(button.text).catch((e) => setError(errorMessage(e, 'Could not send')));
          return;
        }
      }

      const parsed = commands.length > 0 ? parseCommand(text) : null;
      const entry = parsed ? registry.commandsFor(chatId, scope).get(parsed.name) : undefined;
      if (parsed && entry && !worksOn(entry.command, session)) {
        setError(`/${parsed.name} does not work on this protocol.`);
        return;
      }
      if (parsed && !entry) {
        const elsewhere = registry.commands().get(parsed.name);
        const home = elsewhere ? registry.get(elsewhere.pluginId)?.manifest.name : undefined;
        setError(
          elsewhere && home
            ? elsewhereMessage(parsed.name, elsewhere.command.showIn, scope, home)
            : `Unknown slash command /${parsed.name}. Type / to see what's available.`
        );
        return;
      }

      setBusy(true);
      try {
        if (parsed && entry) {
          onRunningChange(`/${parsed.name}`);
          const result = await entry.command.run({
            rest: parsed.rest,
            args: parsed.args,
            chatId,
            context: entry.context,
            respond,
          });
          if (result.type === 'error') await respond(result.message);
          if (result.type === 'notice') toast[result.tone ?? 'info'](result.message);
          setDraft(result.type === 'setComposer' ? result.text : '');
        } else {
          setDraft(await onSendText(text));
        }
      } catch (e) {
        const message = errorMessage(e, 'Could not send');
        if (entry) await respond(message).catch(() => setError(message));
        else setError(message);
      }
      setBusy(false);
      onRunningChange(null);
    },
    [registry, chatId, scope, session, commands.length, onSendText, onRunningChange, setDraft]
  );

  const dispatched = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingCommand) {
      dispatched.current = null;
      return;
    }
    if (dispatched.current === pendingCommand) return;
    dispatched.current = pendingCommand;
    if (busy) {
      onPendingCommandHandled();
      return;
    }
    void Promise.resolve()
      .then(() => dispatch(pendingCommand, 'action'))
      .finally(onPendingCommandHandled);
  }, [pendingCommand, busy, dispatch, onPendingCommandHandled]);

  return { commands, dispatch, busy, error, setError };
}

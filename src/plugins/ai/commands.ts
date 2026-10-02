import { AiError, isAiError } from '@/core/ai/errors';
import { deviceLanguage, findLanguage, type Language } from '@/core/ai/languages';
import { translateText } from '@/core/ai/translate';
import {
  resolveProvider,
  type AiAnswer,
  type AiProvider,
  type CompletionRequest,
} from '@/core/ai/providers';
import type { WidgetContent } from '@/core/messaging/types';
import type { PluginContext, SlashCommand } from '@/core/plugins/types';
import { W } from '@/design/widgets';

import {
  parseStyle,
  parseSuggestions,
  rewriteRequest,
  STYLES,
  suggestRequest,
  summaryRequest,
  transcript,
} from './prompts';

const SUMMARY_DEFAULT = 50;
const SUMMARY_MAX = 300;
const SUGGEST_CONTEXT = 20;

function accountOf(context: PluginContext): string {
  const id = context.account.accountId;
  if (!id) throw new AiError('unavailable', 'No account is active yet.');
  return id;
}

async function providerOf(context: PluginContext): Promise<AiProvider> {
  const lookup = await resolveProvider(accountOf(context));
  if (!lookup.ok) throw new AiError('unavailable', lookup.reason);
  return lookup.provider;
}

async function ask(context: PluginContext, request: CompletionRequest): Promise<AiAnswer> {
  const provider = await providerOf(context);
  return { text: await provider.complete(request), label: provider.label };
}

/** Everything after the first word, line breaks kept. */
function afterFirstWord(rest: string): string {
  return rest.replace(/^\s*\S+\s*/, '');
}

function answerCard(title: string, answer: AiAnswer, mistakes = false): WidgetContent {
  return {
    kind: 'widget',
    fallback: `${title}: ${answer.text}`,
    widget: W.card(
      [
        W.text(answer.text),
        W.badges([
          { label: answer.label },
          ...(mistakes ? [{ label: 'May contain mistakes', tone: 'warning' as const }] : []),
        ]),
      ],
      { title, icon: 'sparkles-outline' }
    ),
  };
}

function setupCard(reason: string): WidgetContent {
  return {
    kind: 'widget',
    fallback: reason,
    widget: W.card(
      [W.text(reason), W.actions([{ label: 'AI settings', command: '/ai settings' }])],
      { title: 'AI', icon: 'sparkles-outline', tone: 'warning' }
    ),
  };
}

/** No model to use is answered with the way to set one up, not a bare error. */
function offeringSetup(command: SlashCommand): SlashCommand {
  return {
    ...command,
    async run(invocation) {
      try {
        return await command.run(invocation);
      } catch (error) {
        if (!isAiError(error, 'unavailable')) throw error;
        await invocation.respond(setupCard(error.message));
        return { type: 'handled' };
      }
    },
  };
}

export function aiCommands(context: PluginContext): SlashCommand[] {
  const commands: SlashCommand[] = [
    {
      name: 'rewrite',
      showIn: ['dm', 'group'],
      description: 'Rewrite your text before you send it',
      usage: `/rewrite [${Object.keys(STYLES).join(' | ')}] <text>`,
      async run({ args, rest }) {
        const style = parseStyle(args[0]);
        const text = (style ? afterFirstWord(rest) : rest).trim();
        if (!text) {
          return {
            type: 'error',
            message: 'Type your text after /rewrite, for example "/rewrite shorter …".',
          };
        }
        const answer = await ask(context, rewriteRequest(text, style ?? 'clearer'));
        return { type: 'setComposer', text: answer.text };
      },
    },

    {
      name: 'translate',
      showIn: ['dm', 'group', 'channel'],
      description: 'Translate the last message, or your own text before you send it',
      usage: '/translate [language] [text]',
      async run({ args, rest, chatId, respond }) {
        const named = args[0] ? findLanguage(args[0]) : null;
        const text = (named ? afterFirstWord(rest) : rest).trim();
        const target: Language = named ?? deviceLanguage();
        const account = accountOf(context);

        if (named && text) {
          const answer = await translateText(account, text, target);
          return { type: 'setComposer', text: answer.text };
        }

        const source = text
          ? { from: null, text }
          : (await context.chat.messages(chatId, 30)).filter((m) => !m.fromMe && m.text).at(-1);
        if (!source) return { type: 'error', message: 'There is no message to translate yet.' };

        const answer = await translateText(account, source.text, target);
        const title = source.from ? `${source.from}, in ${target.name}` : `In ${target.name}`;
        await respond(answerCard(title, answer));
        return { type: 'handled' };
      },
    },

    {
      name: 'summarize',
      aliases: ['summarise'],
      showIn: ['dm', 'group', 'channel'],
      description: 'Summarise the latest messages of this chat, for you only',
      usage: '/summarize [number of messages]',
      async run({ args, chatId, respond }) {
        const asked = Number(args[0]);
        const limit =
          Number.isInteger(asked) && asked > 0 ? Math.min(asked, SUMMARY_MAX) : SUMMARY_DEFAULT;
        const messages = (await context.chat.messages(chatId, limit)).filter((m) => m.text);
        if (messages.length < 2) {
          return { type: 'error', message: 'There is not enough here to summarise yet.' };
        }

        const provider = await providerOf(context);
        const budget = provider.maxInputChars - summaryRequest('').instructions.length - 32;
        const chat = transcript(messages, budget);
        const text = await provider.complete(summaryRequest(chat.text));
        const title =
          chat.count === 1
            ? 'Summary of the last message'
            : `Summary of the last ${chat.count} messages`;
        await respond(answerCard(title, { text, label: provider.label }, true));
        return { type: 'handled' };
      },
    },

    {
      name: 'suggest',
      showIn: ['dm', 'group'],
      description: 'Suggest replies to the latest messages, for you to pick and edit',
      usage: '/suggest',
      async run({ chatId, respond }) {
        const messages = (await context.chat.messages(chatId, SUGGEST_CONTEXT)).filter(
          (m) => m.text
        );
        if (!messages.some((m) => !m.fromMe)) {
          return { type: 'error', message: 'There is nothing to answer yet.' };
        }

        const provider = await providerOf(context);
        const budget = provider.maxInputChars - suggestRequest('').instructions.length - 32;
        const replies = parseSuggestions(
          await provider.complete(suggestRequest(transcript(messages, budget).text))
        );
        if (replies.length === 0) throw new AiError('server', 'The model suggested nothing.');

        await respond({
          kind: 'widget',
          fallback: `Replies you could send: ${replies.join(' / ')}`,
          widget: W.card(
            [
              ...replies.flatMap((reply) => [
                W.text(reply),
                W.actions([{ label: 'Use this', command: `/draft ${reply}` }]),
              ]),
              W.badges([{ label: provider.label }]),
            ],
            { title: 'Replies you could send', icon: 'sparkles-outline' }
          ),
        });
        return { type: 'handled' };
      },
    },

    {
      name: 'ai',
      hidden: true,
      showIn: ['dm', 'group', 'channel'],
      description: 'Show which model the AI commands use',
      usage: '/ai [settings]',
      async run({ args, respond }) {
        if (args[0]?.toLowerCase() === 'settings') {
          context.ui.openSettings('ai');
          return { type: 'handled' };
        }
        const lookup = await resolveProvider(accountOf(context));
        if (!lookup.ok) throw new AiError('unavailable', lookup.reason);
        const { label, onDevice } = lookup.provider;
        await respond({
          kind: 'widget',
          fallback: `AI commands use ${label}`,
          widget: W.card(
            [
              W.text(
                onDevice
                  ? `${label}. What you ask stays on this device.`
                  : `${label}. What you ask is sent to that server.`
              ),
              W.actions([{ label: 'AI settings', command: '/ai settings' }]),
            ],
            { title: 'AI', icon: 'sparkles-outline' }
          ),
        });
        return { type: 'handled' };
      },
    },
  ];
  return commands.map(offeringSetup);
}

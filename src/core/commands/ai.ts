import { useAiStore } from '@/core/ai/ai-store';
import { AiError, isAiError } from '@/core/ai/errors';
import { deviceLanguage, findLanguage, type Language } from '@/core/ai/languages';
import { translateText } from '@/core/ai/translate';
import {
  resolveProvider,
  type AiAnswer,
  type AiProvider,
  type CompletionRequest,
} from '@/core/ai/providers';
import {
  parseStyle,
  parseSuggestions,
  rewriteRequest,
  STYLES,
  suggestRequest,
  summaryRequest,
  transcript,
} from '@/core/ai/prompts';
import { recentLines } from '@/core/messaging/chat-lines';
import type { WidgetContent } from '@/core/messaging/types';
import type { CoreFeature } from '@/core/plugins/registry';
import type { ComposerAction, SlashCommand } from '@/core/plugins/types';
import { W } from '@/design/widgets';

const SUMMARY_DEFAULT = 50;
const SUMMARY_MAX = 300;
const SUGGEST_CONTEXT = 20;

function account(): string {
  const id = useAiStore.getState().accountId;
  if (!id) throw new AiError('unavailable', 'No account is active yet.');
  return id;
}

async function provider(): Promise<AiProvider> {
  const lookup = await resolveProvider(account());
  if (!lookup.ok) throw new AiError('unavailable', lookup.reason);
  return lookup.provider;
}

async function ask(request: CompletionRequest): Promise<AiAnswer> {
  const model = await provider();
  return { text: await model.complete(request), label: model.label };
}

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
    widget: W.card([W.text(reason)], { title: 'AI', icon: 'sparkles-outline', tone: 'warning' }),
  };
}

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

const commands = (
  [
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
        const answer = await ask(rewriteRequest(text, style ?? 'clearer'));
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
        const accountId = account();

        const already = { type: 'notice', message: `That is already in ${target.name}.` } as const;

        if (named && text) {
          const answer = await translateText(accountId, text, target);
          if (answer.text.trim() === text) return already;
          return { type: 'setComposer', text: answer.text };
        }

        const source = text
          ? { from: null, text }
          : (await recentLines(chatId, 30)).filter((m) => !m.fromMe && m.text).at(-1);
        if (!source) return { type: 'error', message: 'There is no message to translate yet.' };

        const answer = await translateText(accountId, source.text, target);
        if (answer.text.trim() === source.text.trim()) return already;
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
        const messages = (await recentLines(chatId, limit)).filter((m) => m.text);
        if (messages.length < 2) {
          return { type: 'error', message: 'There is not enough here to summarise yet.' };
        }

        const model = await provider();
        const budget = model.maxInputChars - summaryRequest('').instructions.length - 32;
        const chat = transcript(messages, budget);
        const text = await model.complete(summaryRequest(chat.text));
        const title =
          chat.count === 1
            ? 'Summary of the last message'
            : `Summary of the last ${chat.count} messages`;
        await respond(answerCard(title, { text, label: model.label }, true));
        return { type: 'handled' };
      },
    },

    {
      name: 'suggest',
      showIn: ['dm', 'group'],
      description: 'Suggest replies to the latest messages, for you to pick and edit',
      usage: '/suggest',
      async run({ chatId, respond }) {
        const messages = (await recentLines(chatId, SUGGEST_CONTEXT)).filter((m) => m.text);
        if (!messages.some((m) => !m.fromMe)) {
          return { type: 'error', message: 'There is nothing to answer yet.' };
        }

        const model = await provider();
        const budget = model.maxInputChars - suggestRequest('').instructions.length - 32;
        const replies = parseSuggestions(
          await model.complete(suggestRequest(transcript(messages, budget).text))
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
              W.badges([{ label: model.label }]),
            ],
            { title: 'Replies you could send', icon: 'sparkles-outline' }
          ),
        });
        return { type: 'handled' };
      },
    },
  ] satisfies SlashCommand[]
).map(offeringSetup);

const composerActions: ComposerAction[] = [
  {
    id: 'ai-rewrite',
    label: 'Rewrite',
    icon: 'create-outline',
    command: '/rewrite',
    takesDraft: true,
    showIn: ['dm', 'group'],
  },
  {
    id: 'ai-translate',
    label: process.env.EXPO_OS === 'android' ? 'Translate with Google' : 'Translate',
    icon: 'globe-outline',
    command: '/translate',
    showIn: ['dm', 'group', 'channel'],
  },
  {
    id: 'ai-summarize',
    label: 'Summarize',
    icon: 'document-text-outline',
    command: '/summarize',
    showIn: ['dm', 'group', 'channel'],
  },
  {
    id: 'ai-suggest',
    label: 'Suggest a reply',
    icon: 'chatbubbles-outline',
    command: '/suggest',
    showIn: ['dm', 'group'],
  },
];

/** Offered while the switch in Settings › AI is on. */
export const aiFeature: CoreFeature = {
  commands,
  composerActions,
  isOn: () => useAiStore.getState().enabled,
  subscribe: (listener) =>
    useAiStore.subscribe((state, previous) => {
      if (state.enabled !== previous.enabled) listener();
    }),
};

import { useAccountStore } from '@/core/account/account-store';
import { TRANSLATE_CHIP_LABEL } from '@/core/ai/device';
import { AiError, isAiError } from '@/core/ai/errors';
import { deviceLanguage, findLanguage } from '@/core/ai/languages';
import {
  completeOver,
  parseStyle,
  parseSuggestions,
  rewriteRequest,
  STYLES,
  SUGGEST_CONTEXT,
  suggestRequest,
  summaryRequest,
} from '@/core/ai/prompts';
import { resolveProvider, type AiAnswer } from '@/core/ai/providers';
import { translateText } from '@/core/ai/translate';
import { useAppearanceStore } from '@/core/app/appearance';
import { recentLines } from '@/core/messaging/chat-lines';
import type { WidgetContent } from '@/core/messaging/types';
import type { CoreFeature } from '@/core/plugins/registry';
import type { ComposerAction, SlashCommand } from '@/core/plugins/types';
import { W } from '@/design/widgets';

const SUMMARY_DEFAULT = 50;
const SUMMARY_MAX = 300;

function account(): string {
  const id = useAccountStore.getState().activeAccountId;
  if (!id) throw new AiError('unavailable', 'No account is active yet.');
  return id;
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

function offeringSetup(command: SlashCommand): SlashCommand {
  return {
    ...command,
    async run(invocation) {
      try {
        return await command.run(invocation);
      } catch (error) {
        if (!isAiError(error, 'unavailable')) throw error;
        await invocation.respond({
          kind: 'widget',
          fallback: error.message,
          widget: W.card([W.text(error.message)], {
            title: 'AI',
            icon: 'sparkles-outline',
            tone: 'warning',
          }),
        });
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
        const model = await resolveProvider(account());
        return {
          type: 'setComposer',
          text: await model.complete(rewriteRequest(text, style ?? 'clearer')),
        };
      },
    },

    {
      name: 'translate',
      showIn: ['dm', 'group', 'channel'],
      description: 'Translate the last message, or your own text before you send it',
      usage: '/translate [language] [text]',
      async run({ args, rest, chatId, respond }) {
        const named = args[0] ? findLanguage(args[0]) : null;
        const typed = (named ? afterFirstWord(rest) : rest).trim();
        const target = named ?? deviceLanguage();
        const received = typed
          ? null
          : (await recentLines(chatId, 30)).filter((m) => !m.fromMe && m.text).at(-1);
        const text = typed || received?.text;
        if (!text) return { type: 'error', message: 'There is no message to translate yet.' };

        const answer = await translateText(account(), text, target);
        if (answer.text.trim() === text.trim()) {
          return { type: 'notice', message: `That is already in ${target.name}.` };
        }
        if (named && typed) return { type: 'setComposer', text: answer.text };
        const title = received ? `${received.from}, in ${target.name}` : `In ${target.name}`;
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
        const [lines, model] = await Promise.all([
          recentLines(chatId, limit),
          resolveProvider(account()),
        ]);
        const messages = lines.filter((m) => m.text);
        if (messages.length < 2) {
          return { type: 'error', message: 'There is not enough here to summarise yet.' };
        }

        const { text, count } = await completeOver(model, messages, summaryRequest);
        const title =
          count === 1 ? 'Summary of the last message' : `Summary of the last ${count} messages`;
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
        const [lines, model] = await Promise.all([
          recentLines(chatId, SUGGEST_CONTEXT),
          resolveProvider(account()),
        ]);
        const messages = lines.filter((m) => m.text);
        if (!messages.some((m) => !m.fromMe)) {
          return { type: 'error', message: 'There is nothing to answer yet.' };
        }

        const replies = parseSuggestions(
          (await completeOver(model, messages, suggestRequest)).text
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
    command: '/rewrite clearer',
    takesDraft: true,
    showIn: ['dm', 'group'],
  },
  {
    id: 'ai-translate',
    label: TRANSLATE_CHIP_LABEL,
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

export const aiFeature: CoreFeature = {
  commands,
  composerActions,
  isOn: () => useAppearanceStore.getState().aiInChats,
  subscribe: (listener) =>
    useAppearanceStore.subscribe((state, previous) => {
      if (state.aiInChats !== previous.aiInChats) listener();
    }),
};

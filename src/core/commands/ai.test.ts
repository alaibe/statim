import { useAccountStore } from '@/core/account/account-store';
import { AiError } from '@/core/ai/errors';
import { resolveProvider } from '@/core/ai/providers';
import { translateText } from '@/core/ai/translate';
import { useAppearanceStore } from '@/core/app/appearance';
import { recentLines, type ChatLine } from '@/core/messaging/chat-lines';
import { asChatId } from '@/core/messaging/testing/ids';
import type { CommandInvocation, PluginContext, SlashCommand } from '@/core/plugins/types';

import { aiFeature } from './ai';

jest.mock('@/core/ai/providers', () => ({ resolveProvider: jest.fn() }));
jest.mock('@/core/ai/translate', () => ({ translateText: jest.fn() }));
jest.mock('@/core/messaging/chat-lines', () => ({ recentLines: jest.fn() }));

const resolve = resolveProvider as jest.MockedFunction<typeof resolveProvider>;
const translate = translateText as jest.MockedFunction<typeof translateText>;
const lines = recentLines as jest.MockedFunction<typeof recentLines>;
const complete = jest.fn<Promise<string>, [unknown]>();
const chatId = asChatId('xmtp-chat');

const history: ChatLine[] = [
  { from: 'Ann', fromMe: false, text: 'Dinner Thursday?' },
  { from: 'You', fromMe: true, text: 'Maybe' },
  { from: 'Ann', fromMe: false, text: 'The Thai place?' },
];

const command = (name: string) => aiFeature.commands.find((c) => c.name === name) as SlashCommand;

function invoke(name: string, rest = '') {
  const respond = jest.fn<Promise<void>, [unknown]>(async () => {});
  const invocation: CommandInvocation = {
    rest,
    args: rest.split(/\s+/).filter(Boolean),
    chatId,
    context: {} as PluginContext,
    respond,
  };
  return { result: command(name).run(invocation), respond };
}

beforeEach(() => {
  jest.clearAllMocks();
  useAccountStore.setState({ activeAccountId: 'acct' });
  useAppearanceStore.setState({ aiInChats: true });
  lines.mockImplementation(async (_id, limit) => history.slice(-limit));
  resolve.mockResolvedValue({
    label: 'Apple Intelligence · on-device',
    maxInputChars: 6000,
    complete,
  });
});

it('/rewrite puts the rewritten text in the composer, in the style asked', async () => {
  complete.mockResolvedValueOnce('Could you come tomorrow?');
  const { result } = invoke('rewrite', 'formal can u come tmrw');
  await expect(result).resolves.toEqual({ type: 'setComposer', text: 'Could you come tomorrow?' });
  expect(JSON.stringify(complete.mock.calls[0][0])).toContain('formal and professional');
  expect(JSON.stringify(complete.mock.calls[0][0])).toContain('can u come tmrw');
});

it('/translate with a language and text fills the composer for sending', async () => {
  translate.mockResolvedValueOnce({ text: 'À jeudi', label: 'Apple Translation · on-device' });
  const { result, respond } = invoke('translate', 'fr See you Thursday');
  await expect(result).resolves.toEqual({ type: 'setComposer', text: 'À jeudi' });
  expect(translate).toHaveBeenCalledWith(
    'acct',
    'See you Thursday',
    expect.objectContaining({ tag: 'fr' })
  );
  expect(respond).not.toHaveBeenCalled();
});

it('/translate on its own translates the last message someone else sent, for you only', async () => {
  translate.mockResolvedValueOnce({
    text: 'Le restaurant thaï ?',
    label: 'Apple Translation · on-device',
  });
  const { result, respond } = invoke('translate', 'french');
  await expect(result).resolves.toEqual({ type: 'handled' });
  expect(translate.mock.calls[0][1]).toBe('The Thai place?');
  expect(JSON.stringify(respond.mock.calls[0][0])).toContain('Ann, in French');
});

it('/summarize answers in a private card that names the model and warns about mistakes', async () => {
  complete.mockResolvedValueOnce('- Ann suggests the Thai place on Thursday');
  const { result, respond } = invoke('summarize');
  await expect(result).resolves.toEqual({ type: 'handled' });
  const card = JSON.stringify(respond.mock.calls[0][0]);
  expect(card).toContain('Summary of the last 3 messages');
  expect(card).toContain('Apple Intelligence · on-device');
  expect(card).toContain('May contain mistakes');
  expect(String((complete.mock.calls[0][0] as { prompt: string }).prompt)).toContain('You: Maybe');
});

it('/suggest offers each reply as a button that fills the composer', async () => {
  complete.mockResolvedValueOnce('Sounds great!\nCan we do Friday?\nNot this week, sorry');
  const { respond, result } = invoke('suggest');
  await result;
  const card = JSON.stringify(respond.mock.calls[0][0]);
  expect(card).toContain('/draft Sounds great!');
  expect(card).toContain('/draft Can we do Friday?');
});

it('answers with the reason when there is no model to use', async () => {
  resolve.mockRejectedValue(
    new AiError(
      'unavailable',
      'This device has no AI model of its own. Set up a model in Settings › AI.'
    )
  );
  const { result, respond } = invoke('summarize');
  await expect(result).resolves.toEqual({ type: 'handled' });
  expect(JSON.stringify(respond.mock.calls[0][0])).toContain('Set up a model in Settings › AI.');
});

it('/translate says when the text is already in that language', async () => {
  translate.mockResolvedValueOnce({
    text: 'The Thai place?',
    label: 'Apple Translation · on-device',
  });
  const { result, respond } = invoke('translate', 'english');
  await expect(result).resolves.toEqual({
    type: 'notice',
    message: 'That is already in English.',
  });
  expect(respond).not.toHaveBeenCalled();
});

it('is offered only while the switch is on', () => {
  const listener = jest.fn();
  const unsubscribe = aiFeature.subscribe(listener);
  useAppearanceStore.setState({ aiInChats: false });
  expect(aiFeature.isOn()).toBe(false);
  useAppearanceStore.setState({ aiInChats: true });
  expect(aiFeature.isOn()).toBe(true);
  expect(listener).toHaveBeenCalledTimes(2);
  unsubscribe();
});

it('/summarize tries again with fewer messages when the model runs out of room', async () => {
  lines.mockResolvedValueOnce(
    Array.from({ length: 40 }, (_, i) => ({
      from: i % 2 ? 'You' : 'Ann',
      fromMe: i % 2 === 1,
      text: `message number ${i} with a little more text in it`,
    }))
  );
  complete.mockRejectedValueOnce(new AiError('too-long', 'too long')).mockResolvedValueOnce('- ok');
  const { result, respond } = invoke('summarize');
  await result;
  const [first, second] = complete.mock.calls.map(([r]) => (r as { prompt: string }).prompt);
  expect(second.length).toBeLessThan(first.length);
  expect(JSON.stringify(respond.mock.calls[0][0])).toMatch(/Summary of the last \d+ messages/);
});

it('the Rewrite chip names its style, so a draft that starts with one keeps the word', async () => {
  const chip = aiFeature.composerActions.find((action) => action.id === 'ai-rewrite');
  complete.mockResolvedValueOnce('A friendly reminder about Thursday.');
  await invoke(
    'rewrite',
    `${chip?.command.replace('/rewrite ', '')} Friendly reminder about thursday`
  ).result;
  const request = JSON.stringify(complete.mock.calls[0][0]);
  expect(request).toContain('clearer and more polite');
  expect(request).toContain('Friendly reminder about thursday');
});

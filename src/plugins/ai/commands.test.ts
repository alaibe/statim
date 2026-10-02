import { resolveProvider } from '@/core/ai/providers';
import { translateText } from '@/core/ai/translate';
import { asChatId } from '@/core/messaging/testing/ids';
import type {
  CommandInvocation,
  PluginContext,
  PluginMessage,
  SlashCommand,
} from '@/core/plugins/types';

import { aiCommands } from './commands';

jest.mock('@/core/ai/providers', () => ({ resolveProvider: jest.fn() }));
jest.mock('@/core/ai/translate', () => ({ translateText: jest.fn() }));

const resolve = resolveProvider as jest.MockedFunction<typeof resolveProvider>;
const translate = translateText as jest.MockedFunction<typeof translateText>;
const complete = jest.fn<Promise<string>, [unknown]>();
const chatId = asChatId('xmtp-chat');

const history: PluginMessage[] = [
  { id: '1', from: 'Ann', fromMe: false, sentAt: 1, text: 'Dinner Thursday?' },
  { id: '2', from: 'You', fromMe: true, sentAt: 2, text: 'Maybe' },
  { id: '3', from: 'Ann', fromMe: false, sentAt: 3, text: 'The Thai place?' },
];

const context = {
  account: { accountId: 'acct' },
  chat: { messages: jest.fn(async (_id: unknown, limit: number) => history.slice(-limit)) },
  ui: { openSettings: jest.fn() },
} as unknown as PluginContext;

const commands = aiCommands(context);
const command = (name: string) => commands.find((c) => c.name === name) as SlashCommand;

function invoke(name: string, rest = '') {
  const respond = jest.fn<Promise<void>, [unknown]>(async () => {});
  const invocation: CommandInvocation = {
    rest,
    args: rest.split(/\s+/).filter(Boolean),
    chatId,
    context,
    respond,
  };
  return { result: command(name).run(invocation), respond };
}

beforeEach(() => {
  jest.clearAllMocks();
  resolve.mockResolvedValue({
    ok: true,
    provider: {
      label: 'Apple Intelligence · on-device',
      onDevice: true,
      maxInputChars: 6000,
      complete,
    },
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

it('answers with the way to set a model up when there is none', async () => {
  resolve.mockResolvedValue({ ok: false, reason: 'This device has no AI model of its own.' });
  const { result, respond } = invoke('summarize');
  await expect(result).resolves.toEqual({ type: 'handled' });
  const card = JSON.stringify(respond.mock.calls[0][0]);
  expect(card).toContain('This device has no AI model of its own.');
  expect(card).toContain('/ai settings');
});

it('/ai settings opens the AI page', async () => {
  await invoke('ai', 'settings').result;
  expect(context.ui.openSettings).toHaveBeenCalledWith('ai');
});

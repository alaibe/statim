import { DEFAULT_AI_CONFIG, loadAiConfig, saveAiConfig, saveAiKey } from '../config';
import { deviceModelState } from '../device';
import { deviceProvider, providerFor, resolveProvider } from '.';

jest.mock('../device', () => ({
  DEVICE_MODEL_NAME: 'Apple Intelligence',
  DEVICE_MODEL_SETTINGS: 'Settings › Apple Intelligence & Siri',
  deviceModelState: jest.fn(),
  completeOnDevice: jest.fn(),
}));

const modelState = deviceModelState as jest.MockedFunction<typeof deviceModelState>;

describe('automatic', () => {
  it('uses the model on this device when it is ready', async () => {
    modelState.mockResolvedValueOnce('ready');
    const lookup = await providerFor(DEFAULT_AI_CONFIG, null);
    expect(lookup).toEqual({ ok: true, provider: deviceProvider });
    expect(deviceProvider.label).toBe('Apple Intelligence · on-device');
  });

  it('says where to turn the model on when it is off', async () => {
    modelState.mockResolvedValueOnce('off');
    await expect(providerFor(DEFAULT_AI_CONFIG, null)).resolves.toEqual({
      ok: false,
      reason: expect.stringContaining('Settings › Apple Intelligence & Siri'),
    });
  });
});

it('needs an address and a model for your own server', async () => {
  const lookup = await providerFor({ source: 'openai', url: 'http://box', model: '' }, null);
  expect(lookup.ok).toBe(false);
  const ready = await providerFor({ source: 'openai', url: 'http://box', model: 'task' }, null);
  expect(ready.ok && ready.provider.label).toBe('task · box');
});

it('needs a key for Anthropic, and defaults its model', async () => {
  expect((await providerFor({ source: 'anthropic', url: '', model: '' }, null)).ok).toBe(false);
  const ready = await providerFor({ source: 'anthropic', url: '', model: '' }, 'sk-ant');
  expect(ready.ok && ready.provider.label).toBe('claude-opus-5-5 · api.anthropic.com');
});

it('reads the account’s saved choice and key', async () => {
  await saveAiConfig('acct-ai', { source: 'anthropic', url: '', model: 'claude-sonnet-5-5' });
  await saveAiKey('acct-ai', 'sk-ant');
  const lookup = await resolveProvider('acct-ai');
  expect(lookup.ok && lookup.provider.label).toBe('claude-sonnet-5-5 · api.anthropic.com');
});

it('forgets an automatic choice instead of storing defaults', async () => {
  await saveAiConfig('acct-auto', { source: 'openai', url: 'http://box', model: 'x' });
  await saveAiConfig('acct-auto', DEFAULT_AI_CONFIG);
  await expect(loadAiConfig('acct-auto')).resolves.toEqual(DEFAULT_AI_CONFIG);
});

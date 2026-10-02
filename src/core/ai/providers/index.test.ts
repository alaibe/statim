import { DEFAULT_AI_CONFIG, saveAiConfig, saveAiKey } from '../config';
import { deviceModelState } from '../device';
import { providerFor, resolveProvider } from '.';
import { deviceProvider } from './on-device';

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
    await expect(providerFor(DEFAULT_AI_CONFIG, null)).resolves.toBe(deviceProvider);
    expect(deviceProvider.label).toBe('Apple Intelligence · on-device');
  });

  it('says where to turn the model on when it is off', async () => {
    modelState.mockResolvedValueOnce('off');
    await expect(providerFor(DEFAULT_AI_CONFIG, null)).rejects.toMatchObject({
      code: 'unavailable',
      message: expect.stringContaining('Settings › Apple Intelligence & Siri'),
    });
  });
});

it('needs an address and a model for your own server', async () => {
  await expect(
    providerFor({ source: 'openai', url: 'http://box', model: '' }, null)
  ).rejects.toMatchObject({ code: 'unavailable' });
  const ready = await providerFor({ source: 'openai', url: 'http://box', model: 'task' }, null);
  expect(ready.label).toBe('task · box');
});

it('needs a key for Anthropic, and defaults its model', async () => {
  await expect(
    providerFor({ source: 'anthropic', url: '', model: '' }, null)
  ).rejects.toMatchObject({ code: 'unavailable' });
  const ready = await providerFor({ source: 'anthropic', url: '', model: '' }, 'sk-ant');
  expect(ready.label).toBe('claude-opus-5-5 · api.anthropic.com');
});

it('reads the account’s saved choice and key', async () => {
  await saveAiConfig('acct-ai', { source: 'anthropic', url: '', model: 'claude-sonnet-5-5' });
  await saveAiKey('acct-ai', 'sk-ant');
  await expect(resolveProvider('acct-ai')).resolves.toMatchObject({
    label: 'claude-sonnet-5-5 · api.anthropic.com',
  });
});

import { loadAiConfig, loadAiKey, type AiConfig } from '../config';
import { deviceModelState } from '../device';
import { AiError } from '../errors';
import { anthropicProvider, DEFAULT_ANTHROPIC_MODEL } from './anthropic';
import type { AiProvider } from './interface';
import { deviceProvider, deviceUnavailableReason, SET_UP_A_MODEL } from './on-device';
import { listModels, openAiProvider } from './openai';

export type { AiAnswer, AiProvider, CompletionRequest } from './interface';

export const OLLAMA_URL = 'http://localhost:11434/v1';

async function localOllama(): Promise<AiProvider | null> {
  if (process.env.EXPO_OS !== 'web') return null;
  const [model] = await listModels(OLLAMA_URL, null, 1_500).catch(() => []);
  return model ? openAiProvider({ url: OLLAMA_URL, model, key: null }) : null;
}

/** Throws `unavailable`, saying what to set up, when there is no model to use. */
export async function providerFor(config: AiConfig, key: string | null): Promise<AiProvider> {
  switch (config.source) {
    case 'auto': {
      const state = await deviceModelState();
      if (state === 'ready') return deviceProvider;
      const ollama = await localOllama();
      if (ollama) return ollama;
      throw new AiError('unavailable', deviceUnavailableReason(state));
    }
    case 'openai':
      if (!config.url || !config.model) {
        throw new AiError(
          'unavailable',
          `Your server needs an address and a model. ${SET_UP_A_MODEL}`
        );
      }
      return openAiProvider({ url: config.url, model: config.model, key });
    case 'anthropic':
      if (!key) throw new AiError('unavailable', `Anthropic needs an API key. ${SET_UP_A_MODEL}`);
      return anthropicProvider({
        key,
        model: config.model || DEFAULT_ANTHROPIC_MODEL,
        url: config.url,
      });
  }
}

export async function resolveProvider(accountId: string): Promise<AiProvider> {
  const config = await loadAiConfig(accountId);
  return providerFor(config, config.source === 'auto' ? null : await loadAiKey(accountId));
}

import { loadAiConfig, loadAiKey, type AiConfig } from '../config';
import { deviceModelState } from '../device';
import { anthropicProvider, DEFAULT_ANTHROPIC_MODEL } from './anthropic';
import type { AiProvider } from './interface';
import { deviceProvider, deviceUnavailableReason } from './on-device';
import { listModels, openAiProvider } from './openai';

export type { AiAnswer, AiProvider, CompletionRequest } from './interface';
export { deviceProvider } from './on-device';

export const OLLAMA_URL = 'http://localhost:11434/v1';
const SETUP = 'Set up a model in Settings › AI.';

export type ProviderLookup =
  | { readonly ok: true; readonly provider: AiProvider }
  | { readonly ok: false; readonly reason: string };

/** Ollama's first model, when a computer runs it on the default port. */
async function localOllama(): Promise<AiProvider | null> {
  if (process.env.EXPO_OS !== 'web') return null;
  const models = await Promise.race([
    listModels(OLLAMA_URL, null).catch(() => [] as string[]),
    new Promise<string[]>((resolve) => setTimeout(() => resolve([]), 1_500)),
  ]);
  return models[0] ? openAiProvider({ url: OLLAMA_URL, model: models[0], key: null }) : null;
}

export async function providerFor(config: AiConfig, key: string | null): Promise<ProviderLookup> {
  switch (config.source) {
    case 'auto': {
      const state = await deviceModelState();
      if (state === 'ready') return { ok: true, provider: deviceProvider };
      const ollama = await localOllama();
      if (ollama) return { ok: true, provider: ollama };
      return { ok: false, reason: deviceUnavailableReason(state) };
    }
    case 'openai':
      if (!config.url || !config.model) {
        return { ok: false, reason: `Your server needs an address and a model. ${SETUP}` };
      }
      return { ok: true, provider: openAiProvider({ url: config.url, model: config.model, key }) };
    case 'anthropic':
      if (!key) return { ok: false, reason: `Anthropic needs an API key. ${SETUP}` };
      return {
        ok: true,
        provider: anthropicProvider({
          key,
          model: config.model || DEFAULT_ANTHROPIC_MODEL,
          url: config.url,
        }),
      };
  }
}

export async function resolveProvider(accountId: string): Promise<ProviderLookup> {
  const [config, key] = await Promise.all([loadAiConfig(accountId), loadAiKey(accountId)]);
  return providerFor(config, key);
}

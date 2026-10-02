import { readCredential, writeCredential } from '@/core/account/credentials';
import { isString, oneOf, shape } from '@/lib/guards';
import { accountAiConfigKey, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';

export const AI_SOURCES = ['auto', 'openai', 'anthropic'] as const;

/**
 * `auto` is the model on this device, or on a computer an Ollama server on
 * localhost. `openai` is any server that speaks OpenAI's chat completions:
 * Ollama, llama.cpp, LM Studio, OpenAI, OpenRouter.
 */
export type AiSource = (typeof AI_SOURCES)[number];

export interface AiConfig {
  readonly source: AiSource;
  readonly url: string;
  readonly model: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = { source: 'auto', url: '', model: '' };

const isAiConfig = shape<AiConfig>({
  source: oneOf(...AI_SOURCES),
  url: isString,
  model: isString,
});

export async function loadAiConfig(accountId: string): Promise<AiConfig> {
  try {
    const raw = await vaultGet(accountAiConfigKey(accountId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isAiConfig(parsed) ? parsed : DEFAULT_AI_CONFIG;
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

export async function saveAiConfig(accountId: string, config: AiConfig): Promise<void> {
  const trimmed = { source: config.source, url: config.url.trim(), model: config.model.trim() };
  const key = accountAiConfigKey(accountId);
  if (trimmed.source === 'auto' && !trimmed.url && !trimmed.model) await vaultDelete(key);
  else await vaultSet(key, JSON.stringify(trimmed));
}

export const loadAiKey = (accountId: string) => readCredential(accountId, 'ai');
export const saveAiKey = (accountId: string, key: string) => writeCredential(accountId, 'ai', key);

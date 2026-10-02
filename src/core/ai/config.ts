import { readCredential, writeCredential } from '@/core/account/credentials';
import { isBoolean, isString, oneOf, optional, shape } from '@/lib/guards';
import { accountAiConfigKey, vaultDelete, vaultGet, vaultSet } from '@/storage/vault';

export const AI_SOURCES = ['auto', 'openai', 'anthropic'] as const;

/**
 * `auto` is the model on this device, or on a computer an Ollama server on
 * localhost. `openai` is any server that speaks OpenAI's chat completions:
 * Ollama, llama.cpp, LM Studio, OpenAI, OpenRouter.
 */
export type AiSource = (typeof AI_SOURCES)[number];

export interface AiConfig {
  /** Whether the AI commands are offered in chats at all. */
  readonly enabled: boolean;
  readonly source: AiSource;
  readonly url: string;
  readonly model: string;
}

export type ModelChoice = Pick<AiConfig, 'source' | 'url' | 'model'>;

export const DEFAULT_AI_CONFIG: AiConfig = {
  enabled: false,
  source: 'auto',
  url: '',
  model: '',
};

const isStored = shape<Omit<AiConfig, 'enabled'> & { enabled?: boolean }>({
  enabled: optional(isBoolean),
  source: oneOf(...AI_SOURCES),
  url: isString,
  model: isString,
});

export async function loadAiConfig(accountId: string): Promise<AiConfig> {
  try {
    const raw = await vaultGet(accountAiConfigKey(accountId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isStored(parsed) ? { ...parsed, enabled: parsed.enabled ?? false } : DEFAULT_AI_CONFIG;
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

/** Merges `change` into what is stored, so the switch and the model settings never overwrite each other. */
export async function saveAiConfig(
  accountId: string,
  change: Partial<AiConfig>
): Promise<AiConfig> {
  const merged = { ...(await loadAiConfig(accountId)), ...change };
  const next: AiConfig = { ...merged, url: merged.url.trim(), model: merged.model.trim() };
  const key = accountAiConfigKey(accountId);
  const isDefault = (Object.keys(DEFAULT_AI_CONFIG) as (keyof AiConfig)[]).every(
    (field) => next[field] === DEFAULT_AI_CONFIG[field]
  );
  if (isDefault) await vaultDelete(key);
  else await vaultSet(key, JSON.stringify(next));
  return next;
}

export const loadAiKey = (accountId: string) => readCredential(accountId, 'ai');
export const saveAiKey = (accountId: string, key: string) => writeCredential(accountId, 'ai', key);

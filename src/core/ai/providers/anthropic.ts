import { AiError } from '../errors';
import { hostOf, REMOTE_MAX_INPUT_CHARS, requestJson } from './remote';
import type { AiProvider } from './interface';

export const ANTHROPIC_URL = 'https://api.anthropic.com';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';

/** Models that accept `fallbacks: "default"`, which retries a declined request on another model. */
const FALLBACK_MODELS = /^claude-(opus-5|sonnet-5-5|fable-5-1)/;

interface MessagesResponse {
  content?: { type?: string; text?: unknown }[];
  stop_reason?: string;
}

export function anthropicProvider({
  key,
  model,
  url,
}: {
  key: string;
  model: string;
  url: string;
}): AiProvider {
  const root = (url.trim() || ANTHROPIC_URL).replace(/\/+$/, '');
  const fallback = FALLBACK_MODELS.test(model) && root === ANTHROPIC_URL;
  return {
    label: `${model} · ${hostOf(root)}`,
    onDevice: false,
    maxInputChars: REMOTE_MAX_INPUT_CHARS,
    async complete({ instructions, prompt }) {
      const body = (await requestJson(`${root}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          ...(fallback ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
        },
        body: JSON.stringify({
          model,
          max_tokens: 16000,
          system: instructions,
          messages: [{ role: 'user', content: prompt }],
          ...(fallback ? { fallbacks: 'default' } : {}),
        }),
      })) as MessagesResponse | null;

      if (body?.stop_reason === 'refusal') {
        throw new AiError('refused', 'The model declined this text.');
      }
      const text = (body?.content ?? [])
        .flatMap((block) =>
          block.type === 'text' && typeof block.text === 'string' ? [block.text] : []
        )
        .join('')
        .trim();
      if (!text) throw new AiError('server', 'The model sent back an empty answer.');
      return text;
    },
  };
}

import { AiError } from '../errors';
import { hostOf, REMOTE_MAX_INPUT_CHARS, requestJson } from './remote';
import type { AiProvider } from './interface';

/** A bare host gets `/v1`; any other path is taken as the server's API root. */
export function apiRoot(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const path = withScheme.replace(/^https?:\/\/[^/]+/i, '');
  return path ? withScheme : `${withScheme}/v1`;
}

/** Reasoning models served by llama.cpp or Ollama can leave their thinking inline. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function headers(key: string | null): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

function messageText(body: unknown): string {
  const choice = (
    body as { choices?: { message?: { content?: unknown }; finish_reason?: unknown }[] }
  )?.choices?.[0];
  const content = choice?.message?.content;
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .map((part: { text?: unknown }) => (typeof part?.text === 'string' ? part.text : ''))
            .join('')
        : '';
  const answer = stripThinking(text);
  if (answer) return answer;
  throw new AiError(
    'server',
    choice?.finish_reason === 'length'
      ? 'The model ran out of room before it answered.'
      : 'The model sent back an empty answer.'
  );
}

export function openAiProvider({
  url,
  model,
  key,
}: {
  url: string;
  model: string;
  key: string | null;
}): AiProvider {
  const root = apiRoot(url);
  return {
    label: `${model} · ${hostOf(root)}`,
    onDevice: false,
    maxInputChars: REMOTE_MAX_INPUT_CHARS,
    async complete({ instructions, prompt }) {
      const body = await requestJson(`${root}/chat/completions`, {
        method: 'POST',
        headers: headers(key),
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: prompt },
          ],
        }),
      });
      return messageText(body);
    },
  };
}

export async function listModels(url: string, key: string | null): Promise<string[]> {
  const body = await requestJson(`${apiRoot(url)}/models`, { headers: headers(key) });
  const data = (body as { data?: { id?: unknown }[] } | null)?.data ?? [];
  return data.flatMap((model) => (typeof model?.id === 'string' ? [model.id] : []));
}

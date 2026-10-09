import type { ChatLine } from '@/core/messaging/chat-lines';
import { isNumber, isRecord } from '@/lib/guards';

import { transcript } from './prompts';
import { requestJson } from './providers/remote';

export const JEV_CONFIDENCE = 0.7;

export const isProbability = (value: unknown): value is number =>
  isNumber(value) && value >= 0 && value <= 1;

export const jevState = (lines: readonly ChatLine[]) => transcript(lines, 12_000).text;

export async function askJev(
  lines: readonly ChatLine[],
  key: string,
  name: string,
  question: Record<string, unknown>
): Promise<unknown> {
  const body = await requestJson(
    'https://api.typesafe.ai/v1/systemone',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'jev-latest',
        state: jevState(lines),
        questions: { [name]: question },
      }),
    },
    15_000
  );
  return isRecord(body) && isRecord(body.answers) ? body.answers[name] : null;
}

import { segmentText } from '@/core/messaging/links';

import { DEVICE_TRANSLATION_LABEL, DEVICE_TRANSLATION_SETTINGS, translateOnDevice } from './device';
import { AiError, isAiError } from './errors';
import type { Language } from './languages';
import { translateRequest } from './prompts';
import { resolveProvider, type AiAnswer } from './providers';

/** Mentions, code and long hex, which the link parser leaves as prose. */
const ALSO_KEEP = /@[\w.-]*\w|`[^`\n]*`|\b0x[0-9a-fA-F]{8,}\b/g;

/** Links, addresses and the rest go to the translator as `{n}`, which it leaves alone. */
function protect(text: string): { masked: string; kept: string[] } {
  const kept: string[] = [];
  const keep = (value: string) => `{${kept.push(value) - 1}}`;
  const masked = segmentText(text)
    .map((segment) =>
      segment.kind === 'text' ? segment.text.replace(ALSO_KEEP, keep) : keep(segment.text)
    )
    .join('');
  return { masked, kept };
}

function restore(translated: string, kept: readonly string[]): string | null {
  let out = translated;
  for (const [i, original] of kept.entries()) {
    if (!out.includes(`{${i}}`)) return null;
    out = out.replace(`{${i}}`, original);
  }
  return out;
}

async function translateKeepingLinks(text: string, target: string): Promise<string> {
  const { masked, kept } = protect(text);
  if (kept.length === 0) return translateOnDevice(text, target);
  return restore(await translateOnDevice(masked, target), kept) ?? translateOnDevice(text, target);
}

function missingLanguage(target: Language): AiError {
  return new AiError(
    'language-missing',
    DEVICE_TRANSLATION_SETTINGS
      ? `Download ${target.name} in ${DEVICE_TRANSLATION_SETTINGS} to translate on this device, or set up a model in Settings › AI.`
      : `${target.name} needs a one-time download. Connect to the internet and try again.`
  );
}

export async function translateText(
  accountId: string,
  text: string,
  target: Language
): Promise<AiAnswer> {
  try {
    return { text: await translateKeepingLinks(text, target.tag), label: DEVICE_TRANSLATION_LABEL };
  } catch (error) {
    if (!isAiError(error) || error.code === 'refused' || error.code === 'too-long') throw error;
    const model = await resolveProvider(accountId).catch((unavailable: unknown) => {
      throw error.code === 'language-missing' ? missingLanguage(target) : unavailable;
    });
    return { text: await model.complete(translateRequest(text, target)), label: model.label };
  }
}

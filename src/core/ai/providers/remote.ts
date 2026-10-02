import { appFetch } from '@/lib/http';

import { AiError } from '../errors';

export const REMOTE_MAX_INPUT_CHARS = 60_000;

export function hostOf(url: string): string {
  return url.replace(/^https?:\/\//i, '').split('/')[0];
}

/** A phone refuses plain http:// to most addresses, and fetch reports that as a bare network failure. */
function unreachable(url: string, error: unknown): string {
  if (/^http:\/\//i.test(url) && process.env.EXPO_OS !== 'web') {
    return `Could not reach ${hostOf(url)}. Phones refuse plain http:// to most addresses: use https://, or on an iPhone a local name such as mac-mini.local.`;
  }
  return `Could not reach ${hostOf(url)}: ${error instanceof Error ? error.message : String(error)}`;
}

function serverError(url: string, status: number, body: unknown): string {
  if (status === 401 || status === 403) return `${hostOf(url)} did not accept the API key.`;
  const error = (body as { error?: string | { message?: unknown } } | null)?.error;
  const message = typeof error === 'string' ? error : error?.message;
  return typeof message === 'string' && message
    ? `${hostOf(url)}: ${message}`
    : `${hostOf(url)} answered with error ${status}.`;
}

export async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs = 180_000
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await appFetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new AiError(
      'server',
      controller.signal.aborted
        ? `${hostOf(url)} took too long to answer.`
        : unreachable(url, error)
    );
  } finally {
    clearTimeout(timer);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new AiError('server', serverError(url, response.status, body));
  return body;
}

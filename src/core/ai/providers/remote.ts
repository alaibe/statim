import { AiError } from '../errors';
import { aiFetch } from './http';

const TIMEOUT_MS = 180_000;
export const REMOTE_MAX_INPUT_CHARS = 60_000;

export function hostOf(url: string): string {
  return url.replace(/^https?:\/\//i, '').split('/')[0];
}

export async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await aiFetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new AiError(
      'server',
      controller.signal.aborted
        ? `${hostOf(url)} took too long to answer.`
        : `Could not reach ${hostOf(url)}: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timer);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new AiError('server', serverError(url, response.status, body));
  return body;
}

function serverError(url: string, status: number, body: unknown): string {
  const error = (body as { error?: unknown } | null)?.error;
  const message =
    typeof error === 'string'
      ? error
      : typeof (error as { message?: unknown } | undefined)?.message === 'string'
        ? (error as { message: string }).message
        : '';
  if (status === 401 || status === 403) return `${hostOf(url)} did not accept the API key.`;
  return message ? `${hostOf(url)}: ${message}` : `${hostOf(url)} answered with error ${status}.`;
}

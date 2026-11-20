import type { HttpError } from "@/core/errors";

/** How a public JSON API says no: its name, its own words for a refusal, and the error it throws. */
export interface JsonApi<Body> {
  name: string;
  /** Said for HTTP 429. */
  limited: string;
  /** Said for HTTP 401 and 403, for an API that takes a key. */
  keyRejected?: string;
  /** The API's explanation of a refusal, or undefined to fall back on the status. */
  explain(status: number, body: Body | null): string | undefined;
  error(status: number, message: string, body: Body | null): HttpError;
}

export function apiFailure<Body>(api: JsonApi<Body>, status: number, body: Body | null): HttpError {
  const message =
    status === 429
      ? api.limited
      : (status === 401 || status === 403) && api.keyRejected
        ? api.keyRejected
        : (api.explain(status, body) ?? `${api.name} could not be reached (HTTP ${status}).`);
  return api.error(status, message, body);
}

export async function fetchJson<T, Body>(url: string, init: RequestInit | undefined, api: JsonApi<Body>): Promise<T> {
  const response = await fetch(url, init);
  if (response.ok) return (await response.json()) as T;
  throw apiFailure(api, response.status, (await response.json().catch(() => null)) as Body | null);
}

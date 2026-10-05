import { appFetch } from '@/lib/http';

const API = 'https://api.apple-cloudkit.com/database/1';

export interface Container {
  id: string;
  environment: 'development' | 'production';
  apiToken: string;
}

/** Apple wants the person to sign in, again or for the first time, at `redirectURL`. */
export class SignInRequired extends Error {
  constructor(readonly redirectURL: string | null) {
    super('Sign in to iCloud.');
  }
}

interface Reply {
  serverErrorCode?: string;
  reason?: string;
  redirectURL?: string;
}

interface Answer<T> {
  /** Each web auth token is good for one round trip; the reply carries the next. */
  token: string;
  body: T;
}

export async function signInURL(container: Container): Promise<string> {
  try {
    await call(container, null, 'users/current');
  } catch (error) {
    if (error instanceof SignInRequired && error.redirectURL) return error.redirectURL;
    throw error;
  }
  throw new Error('iCloud did not ask for a sign-in.');
}

/** Checks the token and rolls it forward. */
export async function currentUser(container: Container, token: string): Promise<string> {
  return (await call(container, token, 'users/current')).token;
}

export interface SealedNote {
  tag: string;
  sealed: string;
}

export async function saveNotes(
  container: Container,
  token: string,
  notes: SealedNote[]
): Promise<string> {
  const answer = await call<{ records?: Reply[] }>(container, token, 'records/modify', {
    atomic: false,
    operations: notes.map((note) => ({
      operationType: 'create',
      record: {
        recordType: 'Note',
        fields: { tag: { value: note.tag }, sealed: { value: note.sealed } },
      },
    })),
  });
  const failed = answer.body.records?.find((record) => record.serverErrorCode);
  if (failed) throw new Error(failed.reason ?? failed.serverErrorCode);
  return answer.token;
}

async function call<T>(
  container: Container,
  token: string | null,
  path: string,
  body?: unknown
): Promise<Answer<T>> {
  let url = `${API}/${container.id}/${container.environment}/private/${path}?ckAPIToken=${encodeURIComponent(container.apiToken)}`;
  if (token) url += `&ckWebAuthToken=${encodeURIComponent(token)}`;
  const response = await appFetch(
    url,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
  );
  const reply = (await response.json().catch(() => ({}))) as Reply & T;
  // A wrong API token and a spent session both answer AUTHENTICATION_FAILED; only a session can have run out.
  if (
    reply.serverErrorCode === 'AUTHENTICATION_REQUIRED' ||
    (token !== null && reply.serverErrorCode === 'AUTHENTICATION_FAILED')
  ) {
    throw new SignInRequired(reply.redirectURL ?? null);
  }
  if (!response.ok || reply.serverErrorCode) {
    throw new Error(reply.reason ?? `iCloud answered ${response.status}.`);
  }
  return {
    token: response.headers.get('X-Apple-CloudKit-Web-Auth-Token') ?? token ?? '',
    body: reply,
  };
}

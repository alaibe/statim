export type XmtpEnvironment = 'dev' | 'local' | 'production';

export function xmtpEnvironment(): XmtpEnvironment {
  const configured = process.env.EXPO_PUBLIC_XMTP_ENV;
  return configured === 'dev' || configured === 'local' || configured === 'production'
    ? configured
    : 'production';
}

export const INSTALLATION_LIMIT = 10;

export const REVOKED_AND_FULL =
  'Another device removed this one from your XMTP inbox, and the inbox is full. ' +
  'Remove a device in Settings › Devices to connect again.';

export function fallbackFilename(uri: string, kind: 'image' | 'voice'): string {
  const fromUri = uri.split('/').pop()?.split('?')[0];
  if (fromUri && fromUri.includes('.')) return fromUri;
  return kind === 'image' ? 'photo.jpg' : 'voice.m4a';
}

/**
 * Per chat, the newest read mark announced and a time none of your messages
 * was sent after, so that a receipt rebuilds its chat only when a tick can change.
 */
export class ReadMarks {
  private readonly read = new Map<string, number>();
  private readonly sentUpTo = new Map<string, number>();

  sent(id: string, at: number): void {
    this.sentUpTo.set(id, Math.max(at, this.sentUpTo.get(id) ?? 0));
  }

  /** Raises the chat's read mark to `at`; whether that can add a tick. */
  raise(id: string, at: number): boolean {
    const known = this.read.get(id) ?? 0;
    if (at <= known) return false;
    this.read.set(id, at);
    return (this.sentUpTo.get(id) ?? Infinity) > known;
  }

  forget(id: string): void {
    this.read.delete(id);
  }
}

export function newestReadByOthers<T>(
  times: Iterable<[string, T]>,
  self: string,
  toMs: (ns: T) => number
): number | undefined {
  let newest: number | undefined;
  for (const [inboxId, ns] of times) {
    if (inboxId !== self) newest = Math.max(newest ?? 0, toMs(ns));
  }
  return newest;
}

import { type KeyObject, sign } from 'node:crypto';
import { type ClientHttp2Session, connect } from 'node:http2';

export const APPLE = ['https://api.push.apple.com', 'https://api.sandbox.push.apple.com'];

export interface Alert {
  payload: Record<string, unknown>;
  priority: 5 | 10;
  collapseId?: string;
}

/** `gone` means the token will never work again and should be forgotten. */
export type Delivery = 'sent' | 'gone' | 'failed';

export interface Sender {
  send(token: string, alert: Alert): Promise<Delivery>;
}

export interface ApnsConfig {
  key: KeyObject;
  keyId: string;
  teamId: string;
  topic: string;
  /** Production first: a development build's token is a BadDeviceToken there. */
  hosts?: string[];
}

const TOKEN_LIFETIME = 50 * 60_000;

export function isDeviceToken(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64,200}$/i.test(value);
}

export class Apns implements Sender {
  readonly #config: ApnsConfig;
  readonly #sessions = new Map<string, ClientHttp2Session>();
  #jwt: { value: string; issuedAt: number } | null = null;

  constructor(config: ApnsConfig) {
    this.#config = config;
  }

  async send(token: string, alert: Alert): Promise<Delivery> {
    for (const host of this.#config.hosts ?? APPLE) {
      const { status, reason } = await this.#post(host, token, alert);
      if (status === 200) return 'sent';
      if (status === 410) return 'gone';
      if (reason === 'BadDeviceToken') continue;
      if (reason === 'DeviceTokenNotForTopic') return 'gone';
      console.warn(`[apns] ${host} answered ${status} ${reason ?? ''}`);
      return 'failed';
    }
    return 'gone';
  }

  close(): void {
    for (const session of this.#sessions.values()) session.close();
    this.#sessions.clear();
  }

  #post(host: string, token: string, alert: Alert): Promise<{ status: number; reason?: string }> {
    return new Promise((resolve) => {
      const request = this.#session(host).request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${this.#token()}`,
        'apns-topic': this.#config.topic,
        'apns-push-type': 'alert',
        'apns-priority': String(alert.priority),
        ...(alert.collapseId ? { 'apns-collapse-id': alert.collapseId } : {}),
      });
      let status = 0;
      let body = '';
      request.setEncoding('utf8');
      request.on('response', (headers) => {
        status = Number(headers[':status']);
      });
      request.on('data', (chunk: string) => {
        body += chunk;
      });
      request.on('end', () => resolve({ status, reason: reasonOf(body) }));
      request.on('error', (error) => {
        console.warn(`[apns] ${host}: ${error.message}`);
        resolve({ status: 0 });
      });
      request.end(JSON.stringify(alert.payload));
    });
  }

  #session(host: string): ClientHttp2Session {
    const open = this.#sessions.get(host);
    if (open && !open.closed && !open.destroyed) return open;
    const session = connect(host);
    const forget = () => {
      if (this.#sessions.get(host) === session) this.#sessions.delete(host);
    };
    session.on('error', forget);
    session.on('goaway', forget);
    session.on('close', forget);
    this.#sessions.set(host, session);
    return session;
  }

  #token(): string {
    const now = Date.now();
    if (this.#jwt && now - this.#jwt.issuedAt < TOKEN_LIFETIME) return this.#jwt.value;
    const header = base64url(JSON.stringify({ alg: 'ES256', kid: this.#config.keyId }));
    const claims = base64url(
      JSON.stringify({ iss: this.#config.teamId, iat: Math.floor(now / 1000) })
    );
    const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
      key: this.#config.key,
      dsaEncoding: 'ieee-p1363',
    });
    const value = `${header}.${claims}.${signature.toString('base64url')}`;
    this.#jwt = { value, issuedAt: now };
    return value;
  }
}

function base64url(text: string): string {
  return Buffer.from(text).toString('base64url');
}

function reasonOf(body: string): string | undefined {
  try {
    return (JSON.parse(body) as { reason?: string }).reason;
  } catch {
    return undefined;
  }
}

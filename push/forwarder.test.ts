import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { createServer, type Http2Server, type IncomingHttpHeaders } from 'node:http2';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, test } from 'node:test';

import { Apns } from './apns.ts';
import { createForwarder } from './forwarder.ts';

const TOPIC = 'im.statim.app';
const LIVE = 'a'.repeat(64);
const SANDBOX = 'b'.repeat(64);
const GONE = 'c'.repeat(64);

interface Received {
  host: 'production' | 'sandbox';
  path: string;
  headers: IncomingHttpHeaders;
  payload: Record<string, any>;
}

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
let received: Received[] = [];
let production: Http2Server;
let sandbox: Http2Server;
let apns: Apns;
let forwarder: ReturnType<typeof createForwarder>;
let base: string;

function fakeApple(host: Received['host'], answer: (token: string) => [number, string?]) {
  const server = createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      const path = String(request.headers[':path']);
      received.push({ host, path, headers: request.headers, payload: JSON.parse(body) });
      const [status, reason] = answer(path.split('/').at(-1)!);
      response.writeHead(status);
      response.end(reason ? JSON.stringify({ reason }) : '');
    });
  });
  return new Promise<Http2Server>((resolve) => server.listen(0, () => resolve(server)));
}

const origin = (server: Http2Server) =>
  `http://localhost:${(server.address() as AddressInfo).port}`;

before(async () => {
  production = await fakeApple('production', (token) =>
    token === LIVE ? [200] : token === GONE ? [410, 'Unregistered'] : [400, 'BadDeviceToken']
  );
  sandbox = await fakeApple('sandbox', (token) =>
    token === SANDBOX ? [200] : [400, 'BadDeviceToken']
  );
  apns = new Apns({
    key: privateKey,
    keyId: 'KEY123',
    teamId: 'TEAM123',
    topic: TOPIC,
    hosts: [origin(production), origin(sandbox)],
  });
  forwarder = createForwarder(apns, TOPIC);
  await new Promise<void>((resolve) => forwarder.listen(0, resolve));
  base = `http://localhost:${(forwarder.address() as AddressInfo).port}`;
});

after(() => {
  apns.close();
  forwarder.close();
  production.close();
  sandbox.close();
});

beforeEach(() => {
  received = [];
});

function notify(notification: Record<string, unknown>) {
  return fetch(`${base}/_matrix/push/v1/notify`, {
    method: 'POST',
    body: JSON.stringify({ notification }),
  }).then((response) => response.json() as Promise<{ rejected: string[] }>);
}

const device = (pushkey: string, extra: Record<string, unknown> = {}) => ({
  app_id: TOPIC,
  pushkey,
  pushkey_ts: 0,
  data: { format: 'event_id_only' },
  ...extra,
});

test('sends a Matrix event to APNs as a mutable alert, signed for the team', async () => {
  const answer = await notify({
    event_id: '$event',
    room_id: '!room:example.org',
    counts: { unread: 3 },
    devices: [device(LIVE, { data: { default_payload: { statim_account: 'acc1' } } })],
  });

  assert.deepEqual(answer, { rejected: [] });
  assert.equal(received.length, 1);
  const [push] = received;
  assert.equal(push.path, `/3/device/${LIVE}`);
  assert.equal(push.headers['apns-topic'], TOPIC);
  assert.equal(push.headers['apns-push-type'], 'alert');
  assert.equal(push.headers['apns-priority'], '10');
  assert.equal(push.headers['apns-collapse-id'], '$event');
  assert.deepEqual(push.payload, {
    statim_account: 'acc1',
    aps: {
      alert: { body: 'New message' },
      sound: 'default',
      'mutable-content': 1,
      'thread-id': '!room:example.org',
    },
    room_id: '!room:example.org',
    event_id: '$event',
  });

  const [header, claims, signature] = String(push.headers.authorization)
    .replace('bearer ', '')
    .split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url').toString()), {
    alg: 'ES256',
    kid: 'KEY123',
  });
  assert.equal(JSON.parse(Buffer.from(claims, 'base64url').toString()).iss, 'TEAM123');
  assert.ok(
    verify(
      'sha256',
      Buffer.from(`${header}.${claims}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature, 'base64url')
    )
  );
});

test('retries a development build token on the sandbox', async () => {
  const answer = await notify({ event_id: '$e', room_id: '!r', devices: [device(SANDBOX)] });

  assert.deepEqual(answer, { rejected: [] });
  assert.deepEqual(
    received.map((push) => push.host),
    ['production', 'sandbox']
  );
});

test('rejects tokens Apple no longer knows, and devices of other apps', async () => {
  const unknown = 'd'.repeat(64);
  const answer = await notify({
    event_id: '$e',
    room_id: '!r',
    devices: [device(GONE), device(unknown), device(LIVE, { app_id: 'org.other.app' })],
  });

  assert.deepEqual(answer.rejected.sort(), [GONE, LIVE, unknown].sort());
});

test('sends nothing for a push that only updates counts', async () => {
  const answer = await notify({ counts: { unread: 0 }, devices: [device(LIVE)] });

  assert.deepEqual(answer, { rejected: [] });
  assert.equal(received.length, 0);
});

test("forwards Telegram's encrypted web push untouched", async () => {
  const sealed = Buffer.from([1, 2, 3, 250]);
  const response = await fetch(`${base}/telegram/${LIVE}/acc1`, {
    method: 'POST',
    headers: { 'content-encoding': 'aes128gcm', ttl: '60' },
    body: sealed,
  });

  assert.equal(response.status, 201);
  assert.deepEqual(received[0].payload.telegram, {
    encoding: 'aes128gcm',
    body: sealed.toString('base64'),
  });
  assert.equal(received[0].payload.statim_account, 'acc1');
  assert.equal(received[0].payload.aps['thread-id'], 'telegram');
});

test('tells Telegram when the device is gone', async () => {
  const response = await fetch(`${base}/telegram/${GONE}/acc1`, { method: 'PUT', body: '1' });

  assert.equal(response.status, 410);
});

test('ignores anything else', async () => {
  assert.equal((await fetch(`${base}/telegram/not-a-token/acc1`, { method: 'POST' })).status, 404);
  assert.equal((await fetch(`${base}/`)).status, 404);
  assert.equal(await (await fetch(`${base}/health`)).text(), 'ok');
});

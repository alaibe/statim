import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { isDeviceToken, type Sender } from './apns.ts';

const APNS_PAYLOAD_LIMIT = 4096;
const BODY_LIMIT = 64 * 1024;
const TELEGRAM = /^\/telegram\/([0-9a-fA-F]+)\/([A-Za-z0-9_-]{1,64})$/;

interface MatrixDevice {
  app_id?: string;
  pushkey?: string;
  data?: { default_payload?: Record<string, unknown> };
}

interface MatrixNotification {
  event_id?: string;
  room_id?: string;
  prio?: 'high' | 'low';
  devices?: MatrixDevice[];
}

/**
 * Turns a homeserver's push (the Matrix push gateway API) or Telegram's web
 * push into an APNs alert for one device. Nothing is stored: the device token
 * is the Matrix pushkey, and part of the URL Telegram is given.
 */
export function createForwarder(apns: Sender, topic: string): Server {
  return createServer((request, response) => {
    route(request, response).catch((error: unknown) => {
      console.warn('[push]', error);
      if (!response.headersSent) reply(response, 500);
    });
  });

  async function route(request: IncomingMessage, response: ServerResponse) {
    const path = new URL(request.url ?? '/', 'http://forwarder').pathname;
    if (request.method === 'GET' && path === '/health') return reply(response, 200, 'ok');
    if (request.method === 'POST' && path === '/_matrix/push/v1/notify') {
      return matrix(request, response);
    }
    const telegramPath = TELEGRAM.exec(path);
    if (telegramPath && (request.method === 'POST' || request.method === 'PUT')) {
      return telegram(request, response, telegramPath[1].toLowerCase(), telegramPath[2]);
    }
    reply(response, 404);
  }

  async function matrix(request: IncomingMessage, response: ServerResponse) {
    let notification: MatrixNotification;
    try {
      notification = (
        JSON.parse((await read(request)).toString('utf8')) as {
          notification: MatrixNotification;
        }
      ).notification;
    } catch {
      return reply(response, 400);
    }
    const devices = notification?.devices ?? [];
    const rejected: string[] = [];
    if (notification.event_id) {
      await Promise.all(
        devices.map(async (device) => {
          if (device.app_id !== topic || !isDeviceToken(device.pushkey)) {
            if (device.pushkey) rejected.push(device.pushkey);
            return;
          }
          const delivery = await apns.send(device.pushkey, {
            priority: notification.prio === 'low' ? 5 : 10,
            collapseId: notification.event_id,
            payload: {
              ...device.data?.default_payload,
              aps: alert(notification.room_id ?? 'matrix'),
              room_id: notification.room_id,
              event_id: notification.event_id,
            },
          });
          if (delivery === 'gone') rejected.push(device.pushkey);
        })
      );
    }
    reply(response, 200, JSON.stringify({ rejected }), 'application/json');
  }

  async function telegram(
    request: IncomingMessage,
    response: ServerResponse,
    token: string,
    account: string
  ) {
    if (!isDeviceToken(token)) return reply(response, 404);
    const body = await read(request);
    const payload: Record<string, unknown> = {
      aps: alert('telegram'),
      statim_account: account,
    };
    if (body.length > 0) {
      const sealed = {
        encoding: request.headers['content-encoding'],
        encryption: request.headers.encryption,
        cryptoKey: request.headers['crypto-key'],
        body: body.toString('base64'),
      };
      if (JSON.stringify({ ...payload, telegram: sealed }).length <= APNS_PAYLOAD_LIMIT) {
        payload.telegram = sealed;
      }
    }
    const delivery = await apns.send(token, { priority: 10, payload });
    reply(response, delivery === 'gone' ? 410 : 201);
  }
}

function alert(thread: string) {
  return {
    alert: { body: 'New message' },
    sound: 'default',
    'mutable-content': 1,
    'thread-id': thread,
  };
}

function read(request: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        request.destroy();
        reject(new Error('body too large'));
      } else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function reply(response: ServerResponse, status: number, body = '', type = 'text/plain') {
  response.writeHead(status, { 'content-type': type });
  response.end(body);
}

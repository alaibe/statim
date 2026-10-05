import { isRecord, isString, shape } from '@/lib/guards';

import type { MxSession } from './api';

const isLoggedIn = shape<{ access_token: string; user_id: string; device_id: string }>({
  access_token: isString,
  user_id: isString,
  device_id: isString,
});

/** Trades a one-time login token, minted by another device of the user, for a session of this one. */
export async function loginWithToken(
  homeserver: string,
  token: string,
  deviceName: string
): Promise<MxSession> {
  const response = await fetch(`${homeserver}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.token',
      token,
      initial_device_display_name: deviceName,
    }),
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok && isLoggedIn(body)) {
    return {
      accessToken: body.access_token,
      userId: body.user_id,
      deviceId: body.device_id,
      homeserverUrl: homeserver,
    };
  }
  throw new Error(
    isRecord(body) && isString(body.error)
      ? `The homeserver did not accept the code: ${body.error}`
      : 'The homeserver did not accept the code.'
  );
}

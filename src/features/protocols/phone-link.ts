import type { HomeserverSession, PhoneLink } from '@/core/homeserver';
import { USER_ID } from '@/protocols/matrix/ids';

const KIND = 'statim-matrix';

/** What the desktop puts in its QR code for a phone. */
export function phoneLinkCode(link: PhoneLink): string {
  return JSON.stringify({
    kind: KIND,
    homeserver: link.homeserver,
    userId: link.userId,
    loginToken: link.loginToken,
  });
}

/** A scanned code is a string anyone could have made, so only a well-formed one is read. */
export function readPhoneLink(code: string): PhoneLink | null {
  try {
    const parsed: unknown = JSON.parse(code);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { kind, homeserver, userId, loginToken } = parsed as Record<string, unknown>;
    if (kind !== KIND || typeof homeserver !== 'string' || typeof loginToken !== 'string')
      return null;
    if (
      !/^https:\/\/[^/\s]+$/.test(homeserver) ||
      typeof userId !== 'string' ||
      !USER_ID.test(userId)
    )
      return null;
    return { homeserver, userId, loginToken, expiresInMs: 0 };
  } catch {
    return null;
  }
}

/** Trades the code's one-time token for this device's own session on that server. */
export async function signInWithLink(
  link: PhoneLink,
  deviceName: string
): Promise<HomeserverSession> {
  const response = await fetch(`${link.homeserver}/_matrix/client/v3/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'm.login.token',
      token: link.loginToken,
      initial_device_display_name: deviceName,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== 'string') {
    throw new Error(
      typeof body.error === 'string'
        ? `The computer did not accept the code: ${body.error}`
        : 'The computer did not accept the code. Show a new one and scan again.'
    );
  }
  return {
    accessToken: body.access_token,
    userId: String(body.user_id),
    deviceId: String(body.device_id),
    homeserverUrl: link.homeserver,
  };
}

import type { PhoneLink } from '@/core/homeserver';
import { isString, oneOf, shape } from '@/lib/guards';

const KIND = 'statim-matrix';

type LinkCode = Pick<PhoneLink, 'homeserver' | 'loginToken'>;

const isCode = shape<LinkCode & { kind: typeof KIND }>({
  kind: oneOf(KIND),
  homeserver: isString,
  loginToken: isString,
});

export function phoneLinkCode(link: LinkCode): string {
  return JSON.stringify({ kind: KIND, homeserver: link.homeserver, loginToken: link.loginToken });
}

export function readPhoneLink(code: string): LinkCode | null {
  try {
    const parsed: unknown = JSON.parse(code);
    if (!isCode(parsed) || !/^https:\/\/[^/\s]+$/.test(parsed.homeserver)) return null;
    return { homeserver: parsed.homeserver, loginToken: parsed.loginToken };
  } catch {
    return null;
  }
}

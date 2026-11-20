/**
 * Every screen usage statistics may name, by route pattern and never by what
 * fills it. A route missing here sends nothing; `screens.test.ts` keeps the
 * list in step with `src/app`.
 */
export const SCREENS = {
  "/chats": "Chats",
  "/requests": "Requests",
  "/contacts": "Contacts",
  "/accounts": "Accounts",
  "/settings": "Settings",
  "/settings/ai": "Settings: AI",
  "/settings/appearance": "Settings: Appearance",
  "/settings/command-line": "Settings: Command line",
  "/settings/devices": "Settings: Devices",
  "/settings/gifs": "Settings: GIFs",
  "/settings/notifications": "Settings: Notifications",
  "/settings/pin": "Settings: PIN",
  "/settings/pin-off": "Settings: Turn off PIN",
  "/settings/plugins": "Settings: Plugins",
  "/settings/privacy": "Settings: Privacy",
  "/settings/protocol/[id]": "Settings: Protocol",
  "/settings/recovery-phrase": "Settings: Recovery phrase",
  "/settings/trades": "Settings: Trades",
  "/chat/[id]": "Chat",
  "/thread/[id]": "Thread",
  "/profile/[id]": "Profile",
  "/new-chat": "New chat",
  "/invite": "Invite contacts",
  "/qr": "QR code",
  "/bridge-login": "Bridge sign-in",
  "/search": "Search",
  "/share": "Share",
} as const;

export type ScreenUrl = keyof typeof SCREENS;

/** The screen `useSegments()` describes, or null for one that is never sent. */
export function screenUrl(segments: readonly string[]): ScreenUrl | null {
  const url = `/${segments.filter((segment) => !/^\(.*\)$/.test(segment)).join("/")}`;
  return Object.hasOwn(SCREENS, url) ? (url as ScreenUrl) : null;
}

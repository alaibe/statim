/** Only the desktop runs a homeserver (`homeserver.web.ts`). */
export interface HomeserverBridge {
  /** The name its login API sits under: `facebook` for Messenger. */
  id: string;
  /** Whether it has a build for this computer. */
  available: boolean;
  enabled: boolean;
}

/** What another device of the owner scans to sign in to the server on the computer. */
export interface PhoneLink {
  homeserver: string;
  loginToken: string;
  expiresInMs: number;
}

export interface HomeserverSession {
  accessToken: string;
  userId: string;
  deviceId: string;
  homeserverUrl: string;
}

/** The server's address, where this build can run one. */
export async function localHomeserverUrl(): Promise<string | null> {
  return null;
}

export async function startHomeserver(_accountId: string): Promise<string> {
  throw new Error('Only the desktop app runs a homeserver.');
}

export async function homeserverSession(
  _accountId: string,
  _deviceName: string
): Promise<HomeserverSession> {
  throw new Error('Only the desktop app runs a homeserver.');
}

export async function homeserverPhoneLink(_accountId: string): Promise<PhoneLink> {
  throw new Error('Only the desktop app runs a homeserver.');
}

export async function homeserverBridges(_accountId: string): Promise<HomeserverBridge[]> {
  return [];
}

export async function setHomeserverBridge(
  _accountId: string,
  _bridge: string,
  _enabled: boolean
): Promise<void> {}

export async function eraseHomeserver(_accountId: string): Promise<void> {}

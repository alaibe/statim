/** Only the desktop runs a homeserver (`homeserver.web.ts`). */
export interface HomeserverState {
  available: boolean;
  running: boolean;
  url: string;
}

export interface HomeserverBridge {
  /** The name its login API sits under: `facebook` for Messenger. */
  id: string;
  /** Whether it has a build for this computer. */
  available: boolean;
  enabled: boolean;
}

export interface HomeserverSession {
  accessToken: string;
  userId: string;
  deviceId: string;
  homeserverUrl: string;
}

export async function homeserverState(_accountId: string): Promise<HomeserverState> {
  return { available: false, running: false, url: '' };
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

export async function homeserverBridges(_accountId: string): Promise<HomeserverBridge[]> {
  return [];
}

export async function setHomeserverBridge(
  _accountId: string,
  _bridge: string,
  _enabled: boolean
): Promise<void> {}

export async function stopHomeserver(): Promise<void> {}

export async function eraseHomeserver(_accountId: string): Promise<void> {}

import { invoke } from '@tauri-apps/api/core';

import type { HomeserverBridge, HomeserverSession, HomeserverState } from './homeserver';

export function homeserverState(accountId: string): Promise<HomeserverState> {
  return invoke('homeserver_state', { accountId });
}

export function startHomeserver(accountId: string): Promise<string> {
  return invoke('homeserver_start', { accountId });
}

export function homeserverSession(
  accountId: string,
  deviceName: string
): Promise<HomeserverSession> {
  return invoke('homeserver_session', { accountId, deviceName });
}

export function homeserverBridges(accountId: string): Promise<HomeserverBridge[]> {
  return invoke('homeserver_bridges', { accountId });
}

export function setHomeserverBridge(
  accountId: string,
  bridge: string,
  enabled: boolean
): Promise<void> {
  return invoke('homeserver_set_bridge', { accountId, bridge, enabled });
}

export function stopHomeserver(): Promise<void> {
  return invoke('homeserver_stop');
}

export function eraseHomeserver(accountId: string): Promise<void> {
  return invoke('homeserver_erase', { accountId });
}

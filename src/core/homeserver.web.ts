import { invoke } from '@tauri-apps/api/core';

import type { HomeserverBridge, HomeserverSession, PhoneLink } from './homeserver';

export function localHomeserverUrl(): Promise<string | null> {
  return invoke('homeserver_url');
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

export function homeserverPhoneLink(accountId: string): Promise<PhoneLink> {
  return invoke('homeserver_phone_link', { accountId });
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

export function eraseHomeserver(accountId: string): Promise<void> {
  return invoke('homeserver_erase', { accountId });
}

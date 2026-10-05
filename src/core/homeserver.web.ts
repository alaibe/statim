import { invoke } from '@tauri-apps/api/core';

import type { HomeserverSession, HomeserverState } from './homeserver';

export function homeserverState(accountId: string): Promise<HomeserverState> {
  return invoke('homeserver_state', { accountId });
}

export function startHomeserver(accountId: string): Promise<string> {
  return invoke('homeserver_start', { accountId });
}

export function homeserverSession(
  accountId: string,
  localpart: string,
  deviceName: string
): Promise<HomeserverSession> {
  return invoke('homeserver_session', { accountId, localpart, deviceName });
}

export function stopHomeserver(): Promise<void> {
  return invoke('homeserver_stop');
}

export function eraseHomeserver(accountId: string): Promise<void> {
  return invoke('homeserver_erase', { accountId });
}

import type { Note } from './note';

/** Only the desktop writes notes for the iPhone (`relay.web.ts`). */
export type RelayState = 'unavailable' | 'off' | 'signed-out' | 'on';

export async function relayState(_accountId: string): Promise<RelayState> {
  return 'unavailable';
}

export async function turnOnRelay(_accountId: string): Promise<void> {}

export async function turnOffRelay(_accountId: string): Promise<void> {}

export function relayToPhone(_accountId: string, _note: Note): void {}

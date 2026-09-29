import type { BridgedNetwork } from '@/core/messaging/networks';

import { localpart, serverName } from './ids';

export interface KnownBridge {
  network: BridgedNetwork;
  localpart: string;
  firstCommand: string;
  preferredFlow?: string;
}

/** mautrix bridges under their default bot names, so a homeserver's bridges can be found by profile. */
export const KNOWN_BRIDGES: readonly KnownBridge[] = [
  { network: 'whatsapp', localpart: 'whatsappbot', firstCommand: 'login qr', preferredFlow: 'qr' },
  { network: 'signal', localpart: 'signalbot', firstCommand: 'login qr', preferredFlow: 'qr' },
  {
    network: 'messenger',
    localpart: 'facebookbot',
    firstCommand: 'login messenger-lite',
    preferredFlow: 'messenger',
  },
  {
    network: 'instagram',
    localpart: 'instagrambot',
    firstCommand: 'login instagram-password',
    preferredFlow: 'instagram',
  },
  { network: 'slack', localpart: 'slackbot', firstCommand: 'login token', preferredFlow: 'token' },
  { network: 'discord', localpart: 'discordbot', firstCommand: 'login-qr' },
  { network: 'googlemessages', localpart: 'gmessagesbot', firstCommand: 'login' },
  { network: 'imessage', localpart: 'imessagebot', firstCommand: 'login' },
  { network: 'x', localpart: 'twitterbot', firstCommand: 'login' },
  { network: 'bluesky', localpart: 'blueskybot', firstCommand: 'login' },
  { network: 'linkedin', localpart: 'linkedinbot', firstCommand: 'login' },
  { network: 'googlechat', localpart: 'googlechatbot', firstCommand: 'login' },
  { network: 'googlevoice', localpart: 'gvoicebot', firstCommand: 'login' },
];

/** Guessed from mautrix's default names: its bot (`@slackbot`) or its puppets (`@slack_…`). */
export function bridgedNetwork(userIds: (string | null | undefined)[]): BridgedNetwork | undefined {
  for (const id of userIds) {
    if (!id) continue;
    const name = localpart(id);
    const bridge =
      knownBridge(name) ?? KNOWN_BRIDGES.find((b) => name.startsWith(`${provisioningName(b)}_`));
    if (bridge) return bridge.network;
  }
  return undefined;
}

export function isBridgeBot(userId: string): boolean {
  return knownBridge(localpart(userId)) !== undefined;
}

export function bridgeBotId(bridge: KnownBridge, selfUserId: string): string {
  return `@${bridge.localpart}:${serverName(selfUserId)}`;
}

/** Where the bridge's login API sits under the homeserver: `/_matrix/provision/<name>/`. */
export function provisioningName(bridge: KnownBridge): string {
  return bridge.localpart.replace(/bot$/, '');
}

export function knownBridge(localpart: string): KnownBridge | undefined {
  return KNOWN_BRIDGES.find((bridge) => bridge.localpart === localpart);
}

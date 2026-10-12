import type { BridgedNetwork } from '@/core/messaging/networks';
import type { CallContent } from '@/core/messaging/types';

import { bridgedNetwork } from './bridges';

const WHATSAPP = /^Incoming (?:(voice|video) )?call\. Use the WhatsApp app to answer\.$/;
const SLACK_HUDDLE = /\n\nJoin via the Slack app: (https:\/\/app\.slack\.com\/client\/\S+)$/;
const PUPPET_ONLY = new Set(['Incoming call', 'Call ended', 'started a call']);

const started = (
  network: BridgedNetwork,
  { video, url }: { video?: boolean; url?: string } = {}
): CallContent => ({
  kind: 'call',
  outcome: 'started',
  ...(video ? { video } : {}),
  openIn: { network, ...(url ? { url } : {}) },
});

/** The text a mautrix bridge posts for a call on its network, which only that network's app can take. */
export function callNotice(
  sender: string,
  body: string,
  msgtype?: 'notice' | 'emote'
): CallContent | undefined {
  const whatsapp = WHATSAPP.exec(body);
  if (whatsapp) return started('whatsapp', { video: whatsapp[1] === 'video' });

  const huddle = SLACK_HUDDLE.exec(body);
  if (huddle) return started('slack', { url: huddle[1] });

  if (!PUPPET_ONLY.has(body)) return undefined;
  const network = bridgedNetwork([sender]);
  if (network === 'signal' && body === 'Incoming call') return started('signal');
  if (network === 'signal' && body === 'Call ended') return { kind: 'call', outcome: 'ended' };
  if (network === 'discord' && msgtype === 'emote' && body === 'started a call') {
    return started('discord');
  }
  return undefined;
}

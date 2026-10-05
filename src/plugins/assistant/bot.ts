import type { Bot } from '@/core/messaging/bots';
import type { WidgetContent } from '@/core/messaging/types';
import { W } from '@/design/widgets';
import { guideUrl } from '@/lib/guide';

export const STATIM_BOT_ID = 'statim';

export function makeStatimBot(): Bot {
  return {
    id: STATIM_BOT_ID,
    name: 'Statim',
    tagline: 'Notebook & slash commands · on-device',
    avatar: require('@/assets/images/statim-avatar.png') as number,

    greeting,
  };
}

function greeting(): ReturnType<Bot['greeting']> {
  return [
    'Welcome to Statim. Use this chat for notes, links and reminders. They are saved on this device. Use /commands to see what you can do here.',
    'Keep your recovery phrase somewhere safe. It restores your account keys, but not notes saved only on this device.',
    lockCard(),
    {
      kind: 'widget',
      fallback:
        'Get started: /commands for slash commands, /plugins for plugins. XMTP, Nostr and Status work from the start; sign in to Telegram and Matrix in Settings. Matrix bridges bring in WhatsApp, Signal and more, and a computer can run Matrix for you.',
      widget: W.card(
        [
          W.actions([
            { label: 'Commands', command: '/commands' },
            { label: 'Plugins', command: '/plugins' },
          ]),
          W.text(
            'XMTP, Nostr and Status work from the start. Telegram and Matrix join once you sign in to them in Settings.'
          ),
          W.text(
            'Through Matrix, bridges bring in WhatsApp, Signal, Messenger, Instagram, Slack, Discord and iMessage. On a computer, Statim can run Matrix and the bridges for you.'
          ),
          W.link('How bridges work', guideUrl('bridges')),
          W.text('Learn about the messaging protocols:'),
          W.link('XMTP', 'https://xmtp.org'),
          W.link('Nostr', 'https://nostr.com'),
          W.link('Status', 'https://status.app'),
          W.link('Telegram', 'https://telegram.org'),
          W.link('Matrix', 'https://matrix.org'),
        ],
        { title: 'Get started', icon: 'sparkles-outline' }
      ),
    },
  ];
}

export interface LockDevice {
  kind: 'phone' | 'computer';
  /** What unlocks it besides a PIN, if anything. */
  biometrics: string | null;
}

/**
 * The greeting is built synchronously, before the device can report its biometrics, so they are
 * named by platform. Most Macs have Touch ID.
 */
export function thisDevice(os = process.env.EXPO_OS): LockDevice {
  if (os === 'ios') return { kind: 'phone', biometrics: 'Face ID or Touch ID' };
  if (os === 'android') return { kind: 'phone', biometrics: 'fingerprint or face unlock' };
  const mac = /Mac/.test(globalThis.navigator?.userAgent ?? '');
  return { kind: 'computer', biometrics: mac ? 'Touch ID' : null };
}

export function lockCard(
  { kind, biometrics }: LockDevice = thisDevice()
): Omit<WidgetContent, 'live'> {
  const who =
    kind === 'phone'
      ? 'Anyone holding your phone can open your chats.'
      : 'Anyone who uses this computer can open your chats.';
  const pin = { label: 'Set a PIN', command: '/security pin' };

  if (!biometrics) {
    return {
      kind: 'widget',
      fallback: 'Lock the app: set a PIN in Settings, under Security.',
      widget: W.card([W.text(`${who} Lock the app with a PIN.`), W.actions([pin])], {
        title: 'Lock the app',
        icon: 'lock-closed-outline',
      }),
    };
  }

  return {
    kind: 'widget',
    fallback: `Lock the app: set a PIN, or turn on ${biometrics}, in Settings, under Security.`,
    widget: W.card(
      [
        W.text(`${who} Lock the app with ${biometrics}, or with a PIN of its own.`),
        W.actions([pin, { label: `Turn on ${biometrics}`, command: '/security', tone: 'neutral' }]),
      ],
      { title: 'Lock the app', icon: 'lock-closed-outline' }
    ),
  };
}

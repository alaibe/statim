import type { Bot } from '@/core/messaging/bots';
import type { WidgetContent } from '@/core/messaging/types';
import { W } from '@/design/widgets';

export const STATUS_BOT_ID = 'status';

export function makeStatusBot(): Bot {
  return {
    id: STATUS_BOT_ID,
    name: 'Status',
    tagline: 'Notebook & slash commands · on-device',
    avatar: require('@/assets/images/status-avatar.png') as number,

    greeting,
  };
}

function greeting(): ReturnType<Bot['greeting']> {
  return [
    'Welcome to Status. Use this chat for notes, links and reminders. They are saved on this device. Use /commands to see what you can do here.',
    'Keep your recovery phrase somewhere safe. It restores your account keys, but not notes saved only on this device.',
    lockCard(),
    {
      kind: 'widget',
      fallback:
        'Get started: /commands for slash commands, /plugins for plugins. Messaging protocols: XMTP, Nostr and Waku.',
      widget: W.card(
        [
          W.actions([
            { label: 'Commands', command: '/commands' },
            { label: 'Plugins', command: '/plugins' },
          ]),
          W.text('Learn about the messaging protocols:'),
          W.link('XMTP', 'https://xmtp.org'),
          W.link('Nostr', 'https://nostr.com'),
          W.link('Waku', 'https://waku.org'),
        ],
        { title: 'Get started', icon: 'sparkles-outline' }
      ),
    },
  ];
}

const BIOMETRICS: Partial<Record<string, string>> = {
  ios: 'Face ID or Touch ID',
  android: 'fingerprint or face unlock',
};

/**
 * A greeting is built synchronously, before the device can say which
 * biometrics it has, so they are named by platform.
 */
export function lockCard(os = process.env.EXPO_OS): Omit<WidgetContent, 'live'> {
  const biometrics = BIOMETRICS[os ?? ''];
  const pin = { label: 'Set a PIN', command: '/security pin' };

  if (!biometrics) {
    return {
      kind: 'widget',
      fallback: 'Lock the app: set a PIN in Settings, under Security.',
      widget: W.card(
        [
          W.text('Anyone who uses this computer can open your chats. Lock the app with a PIN.'),
          W.actions([pin]),
        ],
        { title: 'Lock the app', icon: 'lock-closed-outline' }
      ),
    };
  }

  return {
    kind: 'widget',
    fallback: `Lock the app: set a PIN, or turn on ${biometrics}, in Settings, under Security.`,
    widget: W.card(
      [
        W.text(
          `Anyone holding your phone can open your chats. Lock the app with ${biometrics}, or with a PIN of its own.`
        ),
        W.actions([pin, { label: `Turn on ${biometrics}`, command: '/security', tone: 'neutral' }]),
      ],
      { title: 'Lock the app', icon: 'lock-closed-outline' }
    ),
  };
}

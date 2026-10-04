import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import { parseChatId } from './messaging/namespace';
import type { ChatId } from './messaging/types';

const CHANNEL = 'messages';

let configured = false;

/** While the app is in front its own connections notify, so a push for the same message stays quiet. */
export function configureNotifications(): void {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const { trigger } = notification.request;
      const remote = !!trigger && 'type' in trigger && trigger.type === 'push';
      return {
        shouldPlaySound: false,
        shouldSetBadge: true,
        shouldShowBanner: !remote,
        shouldShowList: !remote,
      };
    },
  });
}

/** Android 13 shows the permission prompt only once a channel exists. */
export async function askForNotifications(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Messages',
      importance: Notifications.AndroidImportance.HIGH,
    });
    const current = await Notifications.getPermissionsAsync();
    if (current.granted || !current.canAskAgain) return;
    await Notifications.requestPermissionsAsync();
  } catch (error) {
    console.warn('[notifications] could not ask for permission', error);
  }
}

export interface MessageNotification {
  chatId: ChatId;
  title: string;
  body: string;
}

export async function notifyMessage(notification: MessageNotification): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: notification.title,
        body: notification.body,
        data: { chatId: notification.chatId },
      },
      trigger: { channelId: CHANNEL },
    });
  } catch (error) {
    console.warn('[notifications] could not post', error);
  }
}

export function appFocused(): boolean {
  return AppState.currentState === 'active';
}

let shownBadge: number | undefined;

export async function setBadgeCount(count: number): Promise<void> {
  if (process.env.EXPO_OS === 'web' || count === shownBadge) return;
  shownBadge = count;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {}
}

export function onNotificationTapped(handler: (chatId: ChatId) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const raw = response.notification.request.content.data?.chatId;
    const id = typeof raw === 'string' ? parseChatId(raw) : null;
    if (id) handler(id);
  });
  return () => subscription.remove();
}

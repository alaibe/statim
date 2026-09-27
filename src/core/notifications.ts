import * as Notifications from 'expo-notifications';

import { parseChatId } from './messaging/namespace';
import type { ChatId } from './messaging/types';

let configured = false;

export function configureNotifications(): void {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
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
      trigger: null,
    });
  } catch (error) {
    console.warn('[notifications] could not post', error);
  }
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

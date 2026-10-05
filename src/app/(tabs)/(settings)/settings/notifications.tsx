import {
  NotificationSettings,
  notificationsIntro,
} from '@/features/settings/notification-settings';
import { SettingsScreen } from '@/features/settings/settings-screen';

export default function NotificationsScreen() {
  return (
    <SettingsScreen title="Notifications" intro={notificationsIntro}>
      <NotificationSettings />
    </SettingsScreen>
  );
}

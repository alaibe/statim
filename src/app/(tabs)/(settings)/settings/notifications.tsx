import {
  FromComputer,
  NotifyIphone,
  OpenAtLogin,
  PushServer,
  StayConnected,
} from '@/features/settings/notification-settings';
import { SettingsScreen } from '@/features/settings/settings-screen';

export default function NotificationsScreen() {
  return (
    <SettingsScreen title="Notifications">
      {process.env.EXPO_OS === 'web' ? (
        <>
          <OpenAtLogin />
          <NotifyIphone />
        </>
      ) : process.env.EXPO_OS === 'android' ? (
        <StayConnected />
      ) : (
        <>
          <FromComputer />
          <PushServer />
        </>
      )}
    </SettingsScreen>
  );
}

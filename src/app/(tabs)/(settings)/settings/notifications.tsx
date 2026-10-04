import { useEffect, useState } from 'react';

import { Icon, ListItem, Section, Text, Toggle } from '@/design';
import { opensAtLogin, setOpenAtLogin } from '@/features/settings/open-at-login';
import { SettingsScreen } from '@/features/settings/settings-screen';

export default function NotificationsScreen() {
  const [atLogin, setAtLogin] = useState(false);

  useEffect(() => {
    opensAtLogin()
      .then(setAtLogin)
      .catch(() => {});
  }, []);

  async function toggle(next: boolean) {
    setAtLogin(next);
    await setOpenAtLogin(next).catch(() => setAtLogin(!next));
  }

  return (
    <SettingsScreen title="Notifications">
      <Text variant="body" className="px-gutter pb-6">
        Statim notifies you while it runs. Closing the window leaves it running; quitting stops it
        until you open it again.
      </Text>

      <Section surface="card" className="mb-6">
        <ListItem
          testID="open-at-login"
          title="Open at login"
          subtitle="Starts Statim without a window when you log in, so messages arrive from the start. Off by default."
          numberOfLinesSubtitle={3}
          leading={<Icon name="flash-outline" size={20} tone="muted" />}
          trailing={<Toggle label="Open at login" value={atLogin} onValueChange={toggle} />}
        />
      </Section>
    </SettingsScreen>
  );
}

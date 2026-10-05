import { useEffect, useState } from 'react';

import { Icon, ListItem, Section, Toggle } from '@/design';
import { relayState, turnOffRelay, turnOnRelay } from '@/core/icloud/relay';

import { opensAtLogin, setOpenAtLogin } from './open-at-login';
import { useAccountSwitch } from './use-account-switch';

export const notificationsIntro =
  'Statim notifies you while it runs. Closing the window leaves it running; quitting stops it until you open it again.';

export const notificationsHint: string | null = 'Open at login';

export function NotificationSettings() {
  return (
    <>
      <OpenAtLogin />
      <NotifyIphone />
    </>
  );
}

function OpenAtLogin() {
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
  );
}

function NotifyIphone() {
  const { state, change } = useAccountSwitch(
    relayState,
    turnOnRelay,
    turnOffRelay,
    'Could not change iPhone notifications'
  );

  if (!state || state === 'unavailable') return null;
  return (
    <Section title="Your iPhone" surface="card" className="mb-6">
      <ListItem
        testID="notify-iphone"
        title="Notify my iPhone"
        subtitle={
          state === 'signed-out'
            ? 'iCloud signed this computer out. Turn it on to sign in again.'
            : 'While this window is in the background, new messages wake your iPhone through your own iCloud, encrypted with a key from this account. Off by default.'
        }
        numberOfLinesSubtitle={4}
        leading={<Icon name="phone-portrait-outline" size={20} tone="muted" />}
        trailing={
          <Toggle
            label="Notify my iPhone"
            value={state === 'on'}
            disabled={change.busy}
            onValueChange={(next) => void change.run(next)}
          />
        }
      />
    </Section>
  );
}

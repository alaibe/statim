import { useEffect, useState } from 'react';

import { Icon, ListItem, Section, Text, Toggle } from '@/design';
import { setStayConnected, staysConnected } from '@/core/stay-connected';
import { opensAtLogin, setOpenAtLogin } from '@/features/settings/open-at-login';

export function OpenAtLogin() {
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
    <>
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
    </>
  );
}

export function StayConnected() {
  const [on, setOn] = useState(staysConnected);

  function toggle(next: boolean) {
    setStayConnected(next);
    setOn(next);
  }

  return (
    <>
      <Text variant="body" className="px-gutter pb-6">
        Statim notifies you while it runs. Android stops it soon after you leave it, and with it the
        connections that bring messages in.
      </Text>

      <Section surface="card" className="mb-6">
        <ListItem
          testID="stay-connected"
          title="Stay connected"
          subtitle="Keeps Statim running after you leave it, so messages arrive and notify. While it is on, Android shows a Connected notification, and it uses more battery. Off by default."
          numberOfLinesSubtitle={5}
          leading={<Icon name="flash-outline" size={20} tone="muted" />}
          trailing={<Toggle label="Stay connected" value={on} onValueChange={toggle} />}
        />
      </Section>
    </>
  );
}

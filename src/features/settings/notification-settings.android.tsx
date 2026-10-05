import { useState } from 'react';

import { Icon, ListItem, Section, Toggle } from '@/design';
import { setStayConnected, staysConnected } from '@/core/stay-connected';

export const notificationsIntro =
  'Statim notifies you while it runs. Android stops it soon after you leave it, and with it the connections that bring messages in.';

export const notificationsHint: string | null = 'Stay connected';

export function NotificationSettings() {
  return <StayConnected />;
}

function StayConnected() {
  const [on, setOn] = useState(staysConnected);

  function toggle(next: boolean) {
    setStayConnected(next);
    setOn(next);
  }

  return (
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
  );
}

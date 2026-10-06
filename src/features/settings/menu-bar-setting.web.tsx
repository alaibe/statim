import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

import { Icon, ListItem, Section, Toggle } from '@/design';

const MAC = /Mac/.test(navigator.userAgent);

export function MenuBarSetting() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (MAC) return;
    invoke<boolean>('menu_bar_hidden')
      .then(setHidden)
      .catch(() => {});
  }, []);

  if (MAC) return null;

  async function toggle(next: boolean) {
    setHidden(next);
    await invoke('menu_bar_set_hidden', { hidden: next }).catch(() => setHidden(!next));
  }

  return (
    <Section title="Window" surface="card" className="mb-6">
      <ListItem
        testID="hide-menu-bar"
        title="Hide menu bar"
        subtitle="Press Alt to show it until your next click."
        numberOfLinesSubtitle={2}
        leading={<Icon name="menu-outline" size={20} tone="muted" />}
        trailing={<Toggle label="Hide menu bar" value={hidden} onValueChange={toggle} />}
      />
    </Section>
  );
}

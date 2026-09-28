import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Text, toast } from '@/design';

const START_OVER = 'status-original accounts erase --all\nstatus-original accounts import';

/** Downloads a newer release in the background and offers to restart into it. */
export function UpdateBar() {
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    if (__DEV__) return;
    let cancelled = false;
    (async () => {
      const found = await check();
      if (!found) return;
      await found.download();
      if (!cancelled) setUpdate(found);
    })().catch((error) => console.warn('[updater]', error));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  const restart = async () => {
    try {
      await update.install();
      await relaunch();
    } catch (error) {
      console.warn('[updater]', error);
      toast.error('The update could not be installed');
    }
  };

  return (
    <View className="gap-2 border-t border-line px-3 py-2">
      <View className="flex-row items-center gap-2">
        <Text variant="footnote" className="flex-1 text-content">
          Version {update.version} is ready
        </Text>
        <Button size="sm" label="Restart" onPress={restart} />
      </View>
      <Text variant="footnote">
        Before 1.0 a new version is not built to read what an older one stored. After restarting,
        erase your accounts and import each again from its recovery phrase:
      </Text>
      <Text selectable className="font-mono text-xs">
        {START_OVER}
      </Text>
    </View>
  );
}

import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, Text, toast } from '@/design';

/** Downloads a newer release in the background and offers to restart into it. */
export function UpdateBar() {
  const [update, setUpdate] = useState<Update | null>(null);
  const looking = useRef(false);

  const look = useEffectEvent(async (asked: boolean): Promise<Update | null> => {
    if (update || looking.current) return null;
    looking.current = true;
    try {
      const found = await check();
      if (!found) {
        if (asked) toast.success('Statim is up to date');
        return null;
      }
      if (asked) toast.info(`Downloading version ${found.version}`);
      await found.download();
      return found;
    } catch (error) {
      console.warn('[updater]', error);
      if (asked) toast.error('Could not check for updates');
      return null;
    } finally {
      looking.current = false;
    }
  });

  useEffect(() => {
    const show = (found: Update | null) => {
      if (found) setUpdate(found);
    };
    if (!__DEV__) void look(false).then(show);
    let stop: UnlistenFn | undefined;
    let cancelled = false;
    void listen<string>('app-menu', ({ payload }) => {
      if (payload === 'check-updates') void look(true).then(show);
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });
    return () => {
      cancelled = true;
      stop?.();
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
    <View className="flex-row items-center gap-2 border-t border-line px-3 py-2">
      <Text variant="footnote" className="flex-1 text-content">
        Version {update.version} is ready
      </Text>
      <Button size="sm" label="Restart" onPress={restart} />
    </View>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';

import { Button, Icon, Screen, Text, useThemeColors } from '@/design';
import { reportError } from '@/core/app/report-error';
import { useAccountStore } from '@/core/account/account-store';
import { isKeyProtectionEnabled } from '@/core/account/key-protection';
import { biometricCapability } from '@/core/account/lock';
import { useLockStore } from '@/core/account/lock-store';
import { useKeyedLoad } from '@/lib/use-keyed-load';

const readProtection = () =>
  isKeyProtectionEnabled().catch((error: unknown) => {
    reportError(error);
    throw error;
  });

export function LockGate() {
  const colors = useThemeColors();
  const prompting = useLockStore((s) => s.prompting);
  const unlock = useLockStore((s) => s.unlock);
  const open = useLockStore((s) => s.noteJustAuthenticated);

  const accountStatus = useAccountStore((s) => s.status);
  const retryUnlock = useAccountStore((s) => s.retryUnlock);

  const [label, setLabel] = useState('Face ID');
  const [checks, setChecks] = useState(0);
  const protection = useKeyedLoad('key-protection', readProtection, checks);
  const protectedKeys = protection.value ?? null;
  const unreadable = protection.error !== undefined;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    biometricCapability()
      .then((c) => setLabel(c.label))
      .catch(reportError);
  }, []);

  const attempt = useCallback(async () => {
    if (protectedKeys === null) return setChecks((n) => n + 1);
    setFailed(false);
    try {
      const passed = protectedKeys ? await retryUnlock() : await unlock();
      if (!passed) setFailed(true);
    } catch (error) {
      reportError(error);
      setFailed(true);
    }
  }, [protectedKeys, retryUnlock, unlock]);

  useEffect(() => {
    if (protectedKeys !== false) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void attempt();
    });
    return () => {
      cancelled = true;
    };
  }, [protectedKeys, attempt]);

  useEffect(() => {
    if (!protectedKeys) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (accountStatus === 'ready' || accountStatus === 'invalidated') open();
      else if (accountStatus === 'blocked') setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [protectedKeys, accountStatus, open]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      if (useLockStore.getState().prompting) return;

      if (protectedKeys) {
        if (useAccountStore.getState().status === 'blocked') void attempt();
        return;
      }
      void attempt();
    });
    return () => subscription.remove();
  }, [attempt, protectedKeys]);

  const stuck = unreadable || failed;

  return (
    <View className="absolute inset-0 bg-canvas">
      <Screen className="items-center justify-center gap-6">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-surface-sunken">
          <Icon
            name={stuck ? 'lock-closed-outline' : 'finger-print-outline'}
            size={34}
            tone={stuck ? 'danger' : 'muted'}
          />
        </View>

        <View className="items-center gap-1.5 px-gutter">
          <Text variant="title">Status Original</Text>
          <Text variant="footnote" className="text-center">
            {unreadable
              ? 'Could not check how this app is locked.'
              : failed
                ? `${label} was not recognised.`
                : `Unlocking with ${label}…`}
          </Text>
        </View>

        {stuck ? (
          <Button label="Try again" disabled={prompting} onPress={attempt} />
        ) : (
          <ActivityIndicator color={colors['content-subtle']} />
        )}
      </Screen>
    </View>
  );
}

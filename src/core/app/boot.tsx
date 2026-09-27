import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAccountStore } from '../account/account-store';
import { registerHardwareVendors } from '../account/vendors';
import { useLockStore } from '../account/lock-store';
import { usePluginHost } from '../plugins/host';
import { reportError } from './report-error';
import { accountRuntime } from '@/runtime';

registerHardwareVendors();

export function useAppBoot(): void {
  const status = useAccountStore((s) => s.status);
  const keyring = useAccountStore((s) => s.keyring);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const restore = useAccountStore((s) => s.restore);
  const { registry, defaultEnabled, makeContext, onPluginsChanged } = usePluginHost();

  useEffect(() => {
    if (status === 'loading') void restore();
  }, [status, restore]);

  useEffect(() => {
    void accountRuntime.synchronize(
      status === 'ready' && keyring && activeAccountId
        ? {
            accountId: activeAccountId,
            keyring,
            registry,
            defaultEnabled,
            makeContext,
            onPluginsChanged,
          }
        : null
    );
  }, [status, keyring, activeAccountId, registry, defaultEnabled, makeContext, onPluginsChanged]);
}

export function useDeepLinkRouter() {
  const { handleUri } = usePluginHost();

  useEffect(() => {
    const consume = (url: string | null) => {
      if (!url) return;
      const parsed = Linking.parse(url);
      const wrapped = typeof parsed.queryParams?.uri === 'string' ? parsed.queryParams.uri : null;
      handleUri(wrapped ?? url).catch((error) => {
        console.warn('[deeplink] no handler for', url, error);
      });
    };

    Linking.getInitialURL().then(consume).catch(reportError);
    const sub = Linking.addEventListener('url', ({ url }) => consume(url));
    return () => sub.remove();
  }, [handleUri]);
}

export function useAppLock() {
  const status = useLockStore((s) => s.status);
  const evaluate = useLockStore((s) => s.evaluate);

  useEffect(() => {
    if (status === 'checking') evaluate().catch(reportError);
  }, [status, evaluate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const lock = useLockStore.getState();
      if (next === 'active') lock.noteForegrounded().catch(reportError);
      else lock.noteBackgrounded();
    });
    return () => subscription.remove();
  }, []);

  return status;
}

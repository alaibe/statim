import { useState } from 'react';

import { useAccountStore } from '@/core/account/account-store';
import { useAction } from '@/features/use-action';
import { useKeyedLoad } from '@/lib/use-keyed-load';

/** An on/off setting of the active account, reloaded after each change. */
export function useAccountSwitch<State>(
  load: (accountId: string) => Promise<State>,
  turnOn: (accountId: string) => Promise<void>,
  turnOff: (accountId: string) => Promise<void>,
  failure: string
) {
  const accountId = useAccountStore((s) => s.activeAccountId);
  const [version, setVersion] = useState(0);
  const { value: state } = useKeyedLoad(accountId, load, version);
  const change = useAction(
    async (on: boolean) => {
      if (!accountId) return;
      try {
        await (on ? turnOn(accountId) : turnOff(accountId));
      } finally {
        setVersion((v) => v + 1);
      }
    },
    { failure }
  );
  return { state, change };
}

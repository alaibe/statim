import { useState } from 'react';

import { Button, Card, Text } from '@/design';
import { homeserverSession, homeserverState, startHomeserver } from '@/core/homeserver';
import { loadProtocolConfig } from '@/core/messaging/config';
import { useAction } from '@/features/use-action';
import { useKeyedLoad } from '@/lib/use-keyed-load';
import { DEVICE_NAME } from '@/protocols/matrix/descriptor';
import { accountRuntime } from '@/runtime';
import { accountMatrixSessionKey, vaultSet } from '@/storage/vault';

/** Where this account's Matrix lives: on this computer, on a server it names, or nowhere yet. */
type Here = 'unavailable' | 'elsewhere' | 'off' | 'on';

export async function hereState(accountId: string): Promise<Here> {
  const [state, config] = await Promise.all([
    homeserverState(accountId),
    loadProtocolConfig(accountId, 'matrix'),
  ]);
  if (!state.available) return 'unavailable';
  const homeserver = config.homeserver?.trim().replace(/\/+$/, '');
  if (!homeserver) return 'off';
  return homeserver === state.url ? 'on' : 'elsewhere';
}

/** Starts the account's server, signs its own user in, and points Matrix at it. */
export async function runHere(accountId: string): Promise<void> {
  const url = await startHomeserver(accountId);
  const session = await homeserverSession(accountId, 'me', DEVICE_NAME);
  await vaultSet(accountMatrixSessionKey(accountId), JSON.stringify(session));
  await accountRuntime.updateProtocolConfig(accountId, 'matrix', {
    homeserver: url,
    userId: session.userId,
  });
}

export function LocalHomeserver({
  accountId,
  signedOut,
}: {
  accountId: string;
  signedOut: boolean;
}) {
  const [version, setVersion] = useState(0);
  const { value: here } = useKeyedLoad(accountId, hereState, version);
  const run = useAction(
    async () => {
      try {
        await runHere(accountId);
      } finally {
        setVersion((v) => v + 1);
      }
    },
    { failure: 'Could not run Matrix on this computer' }
  );

  if (here === 'off') {
    return (
      <Card className="gap-2">
        <Text variant="headline">Matrix on this computer</Text>
        <Text variant="caption">
          No homeserver of your own? Statim can run one on this computer while it runs, with bridges
          to WhatsApp, Signal and more. Your iPhone reaches it through Tailscale.
        </Text>
        <Button
          testID="matrix-run-here"
          label="Run Matrix on this computer"
          size="md"
          fullWidth
          loading={run.busy}
          onPress={() => void run.run()}
        />
      </Card>
    );
  }
  if (here !== 'on') return null;
  return (
    <Card className="gap-2">
      <Text variant="caption">
        {"This account's Matrix runs on this computer, and only while Statim runs."}
      </Text>
      {signedOut ? (
        <Button
          testID="matrix-run-here"
          label="Sign in again"
          size="md"
          fullWidth
          loading={run.busy}
          onPress={() => void run.run()}
        />
      ) : null}
    </Card>
  );
}

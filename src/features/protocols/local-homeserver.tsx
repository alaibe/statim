import { useState } from 'react';

import { Button, Card, ListItem, Text, Toggle } from '@/design';
import {
  homeserverBridges,
  homeserverSession,
  homeserverState,
  setHomeserverBridge,
  startHomeserver,
} from '@/core/homeserver';
import { loadProtocolConfig } from '@/core/messaging/config';
import { BRIDGED_NETWORKS } from '@/core/messaging/networks';
import { useAction } from '@/features/use-action';
import { useKeyedLoad } from '@/lib/use-keyed-load';
import { KNOWN_BRIDGES, provisioningName } from '@/protocols/matrix/bridges';
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
  const session = await homeserverSession(accountId, DEVICE_NAME);
  await vaultSet(accountMatrixSessionKey(accountId), JSON.stringify(session));
  await accountRuntime.updateProtocolConfig(accountId, 'matrix', {
    homeserver: url,
    userId: session.userId,
  });
}

/** What a bridge is called where people see it: Messenger for `facebook`. */
export function networkOf(bridge: string): string {
  const known = KNOWN_BRIDGES.find((candidate) => provisioningName(candidate) === bridge);
  return known ? BRIDGED_NETWORKS[known.network] : bridge;
}

export function LocalHomeserver({
  accountId,
  signedOut,
  onBridgesChanged,
}: {
  accountId: string;
  signedOut: boolean;
  onBridgesChanged: () => void;
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
      {signedOut ? null : <LocalBridges accountId={accountId} onChanged={onBridgesChanged} />}
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

function LocalBridges({ accountId, onChanged }: { accountId: string; onChanged: () => void }) {
  const [version, setVersion] = useState(0);
  const [changing, setChanging] = useState<string | null>(null);
  const { value: bridges } = useKeyedLoad(accountId, homeserverBridges, version);
  const change = useAction(
    async (bridge: string, enabled: boolean) => {
      setChanging(bridge);
      try {
        await setHomeserverBridge(accountId, bridge, enabled);
      } finally {
        setChanging(null);
        setVersion((v) => v + 1);
        onChanged();
      }
    },
    { failure: 'Could not change that bridge' }
  );

  const offered = bridges?.filter((bridge) => bridge.available) ?? [];
  if (offered.length === 0) return null;
  return (
    <>
      <Text variant="footnote" className="font-semibold">
        Bridges on this computer
      </Text>
      <Text variant="caption">
        Turning one on downloads it the first time and restarts the server. Then connect it below to
        sign in to that network.
      </Text>
      {offered.map((bridge) => (
        <ListItem
          key={bridge.id}
          testID={`local-bridge-${bridge.id}`}
          title={networkOf(bridge.id)}
          subtitle={changing === bridge.id ? 'Restarting the server…' : undefined}
          trailing={
            <Toggle
              label={networkOf(bridge.id)}
              value={bridge.enabled}
              disabled={change.busy}
              onValueChange={(next) => void change.run(bridge.id, next)}
            />
          }
        />
      ))}
    </>
  );
}

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ErrorText, ListItem, QrCode, Text, Toggle } from '@/design';
import { errorMessage } from '@/core/errors';
import {
  homeserverBridges,
  homeserverPhoneLink,
  homeserverSession,
  localHomeserverUrl,
  setHomeserverBridge,
  startHomeserver,
  type PhoneLink,
} from '@/core/homeserver';
import { loadProtocolConfig } from '@/core/messaging/config';
import { BRIDGED_NETWORKS } from '@/core/messaging/networks';
import { useAction } from '@/features/use-action';
import { guideUrl } from '@/lib/guide';
import { openExternal } from '@/lib/open-url';
import { useKeyedLoad } from '@/lib/use-keyed-load';
import { knownBridge } from '@/protocols/matrix/bridges';
import { DEVICE_NAME, normaliseHomeserver } from '@/protocols/matrix/descriptor';

import { adoptMatrixSession } from './matrix-session';
import { phoneLinkCode } from './phone-link';

/** Where this account's Matrix lives: on this computer, on a server it names, or nowhere yet. */
type Here = 'unavailable' | 'elsewhere' | 'off' | 'on';

export async function hereState(accountId: string): Promise<Here> {
  const [url, config] = await Promise.all([
    localHomeserverUrl(),
    loadProtocolConfig(accountId, 'matrix'),
  ]);
  if (!url) return 'unavailable';
  const homeserver = normaliseHomeserver(config.homeserver ?? '');
  if (!homeserver) return 'off';
  return homeserver === url ? 'on' : 'elsewhere';
}

export async function runHere(accountId: string): Promise<void> {
  await startHomeserver(accountId);
  await adoptMatrixSession(accountId, await homeserverSession(accountId, DEVICE_NAME));
}

/** What a bridge is called where people see it: Messenger for `facebook`. */
export function networkOf(bridge: string): string {
  const known = knownBridge(`${bridge}bot`);
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
          to WhatsApp, Signal and more. Your phone reaches it through Tailscale.
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
      ) : (
        <>
          <LocalBridges accountId={accountId} onChanged={onBridgesChanged} />
          <ConnectPhone accountId={accountId} />
        </>
      )}
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

function ConnectPhone({ accountId }: { accountId: string }) {
  const [link, setLink] = useState<PhoneLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const enableLink = error?.match(/https:\/\/login\.tailscale\.com\/[^\s,]+/)?.[0];

  useEffect(() => {
    if (!link) return;
    const expire = setTimeout(() => setLink(null), link.expiresInMs);
    return () => clearTimeout(expire);
  }, [link]);

  async function show() {
    setBusy(true);
    setError(null);
    try {
      setLink(await homeserverPhoneLink(accountId));
    } catch (e) {
      setError(errorMessage(e, 'Could not make a code for your phone'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text variant="footnote" className="font-semibold">
        Your phone
      </Text>
      <Text variant="caption">
        With Tailscale on this computer and on your phone, your phone can use this server too. In
        Statim on the phone, open Settings › Matrix and scan the code.
      </Text>
      {link ? (
        <View className="items-center gap-2">
          <QrCode value={phoneLinkCode(link)} size={200} />
          <Text variant="caption">The code works once, for two minutes.</Text>
        </View>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
      {enableLink ? (
        <Button
          label="Turn it on in Tailscale"
          size="sm"
          onPress={() => void openExternal(enableLink).catch(() => {})}
        />
      ) : null}
      <Button
        testID="matrix-connect-phone"
        label={link ? 'Show a new code' : 'Connect your phone'}
        tone="neutral"
        size="sm"
        loading={busy}
        onPress={() => void show()}
      />
      <Button
        label="How to set up Tailscale"
        tone="neutral"
        size="sm"
        onPress={() => void openExternal(guideUrl('computer-matrix', 'your-phone')).catch(() => {})}
      />
    </>
  );
}

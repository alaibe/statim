import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Icon, ListItem, Note, Section, Text, Toggle } from '@/design';
import { useAccountStore } from '@/core/account/account-store';
import { pushServer, setPushServer } from '@/core/app/push';
import { listenToComputer, listeningState, stopListening } from '@/core/icloud/phone';
import { relayState, turnOffRelay, turnOnRelay } from '@/core/icloud/relay';
import { setStayConnected, staysConnected } from '@/core/stay-connected';
import { useAction } from '@/features/use-action';
import { guideUrl } from '@/lib/guide';
import { openExternal } from '@/lib/open-url';
import { useKeyedLoad } from '@/lib/use-keyed-load';
import { opensAtLogin, setOpenAtLogin } from '@/features/settings/open-at-login';

export function OpenAtLogin() {
  const [atLogin, setAtLogin] = useState(false);

  useEffect(() => {
    opensAtLogin()
      .then(setAtLogin)
      .catch(() => {});
  }, []);

  async function toggle(next: boolean) {
    setAtLogin(next);
    await setOpenAtLogin(next).catch(() => setAtLogin(!next));
  }

  return (
    <>
      <Text variant="body" className="px-gutter pb-6">
        Statim notifies you while it runs. Closing the window leaves it running; quitting stops it
        until you open it again.
      </Text>

      <Section surface="card" className="mb-6">
        <ListItem
          testID="open-at-login"
          title="Open at login"
          subtitle="Starts Statim without a window when you log in, so messages arrive from the start. Off by default."
          numberOfLinesSubtitle={3}
          leading={<Icon name="flash-outline" size={20} tone="muted" />}
          trailing={<Toggle label="Open at login" value={atLogin} onValueChange={toggle} />}
        />
      </Section>
    </>
  );
}

export function NotifyIphone() {
  const accountId = useAccountStore((s) => s.activeAccountId);
  const [version, setVersion] = useState(0);
  const { value: state } = useKeyedLoad(accountId, relayState, version);
  const change = useAction(
    async (on: boolean) => {
      if (!accountId) return;
      try {
        await (on ? turnOnRelay(accountId) : turnOffRelay(accountId));
      } finally {
        setVersion((v) => v + 1);
      }
    },
    { failure: 'Could not change iPhone notifications' }
  );

  if (!state || state === 'unavailable') return null;
  return (
    <Section title="Your iPhone" surface="card" className="mb-6">
      <ListItem
        testID="notify-iphone"
        title="Notify my iPhone"
        subtitle={
          state === 'signed-out'
            ? 'iCloud signed this computer out. Turn it on to sign in again.'
            : 'While this window is in the background, new messages wake your iPhone through your own iCloud, encrypted with a key from this account. Off by default.'
        }
        numberOfLinesSubtitle={4}
        leading={<Icon name="phone-portrait-outline" size={20} tone="muted" />}
        trailing={
          <Toggle
            label="Notify my iPhone"
            value={state === 'on'}
            disabled={change.busy}
            onValueChange={(next) => void change.run(next)}
          />
        }
      />
    </Section>
  );
}

export function FromComputer() {
  const accountId = useAccountStore((s) => s.activeAccountId);
  const [version, setVersion] = useState(0);
  const { value: state } = useKeyedLoad(accountId, listeningState, version);
  const change = useAction(
    async (on: boolean) => {
      if (!accountId) return;
      try {
        await (on ? listenToComputer(accountId) : stopListening(accountId));
      } finally {
        setVersion((v) => v + 1);
      }
    },
    { failure: 'Could not change notifications from your computer' }
  );

  if (!state || state === 'unavailable') return null;
  return (
    <Section title="From your computer" surface="card" className="mb-6">
      <ListItem
        testID="from-computer"
        title="Notifications from your computer"
        subtitle="Statim on your computer wakes this iPhone through your iCloud when a message arrives. It needs the same iCloud and this account on the computer. Off by default."
        numberOfLinesSubtitle={4}
        leading={<Icon name="notifications-outline" size={20} tone="muted" />}
        trailing={
          <Toggle
            label="Notifications from your computer"
            value={state === 'on'}
            disabled={change.busy}
            onValueChange={(next) => void change.run(next)}
          />
        }
      />
    </Section>
  );
}

export function StayConnected() {
  const [on, setOn] = useState(staysConnected);

  function toggle(next: boolean) {
    setStayConnected(next);
    setOn(next);
  }

  return (
    <>
      <Text variant="body" className="px-gutter pb-6">
        Statim notifies you while it runs. Android stops it soon after you leave it, and with it the
        connections that bring messages in.
      </Text>

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
    </>
  );
}

export function PushServer() {
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    pushServer()
      .then((server) => {
        setSaved(server);
        setDraft(server ?? '');
      })
      .catch(() => setSaved(null));
  }, []);

  const save = useAction(
    async (value: string) => {
      const server = value.trim().replace(/\/+$/, '') || null;
      if (server && !/^https?:\/\/[^/\s]+/.test(server)) {
        throw new Error('A push server is an address that starts with https://.');
      }
      await setPushServer(server);
      setSaved(server);
      setDraft(server ?? '');
    },
    { failure: 'Could not change the push server' }
  );

  return (
    <>
      <Text variant="body" className="px-gutter pb-6">
        Statim notifies you while it runs. iOS stops it soon after you leave it, so a push server
        wakes it when a Matrix or Telegram message arrives.
      </Text>

      {saved === undefined ? null : (
        <Section title="Push server" surface="card" className="mb-6">
          <View className="gap-3 px-gutter py-4">
            <Field
              testID="push-server"
              value={draft}
              onChangeText={setDraft}
              placeholder="https://push.example.org"
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="url"
              hint={saved ? `Matrix and Telegram wake this phone through ${saved}.` : 'Off.'}
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  testID="push-server-save"
                  label="Save"
                  fullWidth
                  loading={save.busy}
                  disabled={save.busy || draft.trim() === (saved ?? '')}
                  onPress={() => save.run(draft)}
                />
              </View>
              {saved ? (
                <View className="flex-1">
                  <Button
                    testID="push-server-off"
                    label="Turn off"
                    tone="neutral"
                    fullWidth
                    disabled={save.busy}
                    onPress={() => save.run('')}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </Section>
      )}

      <Note className="mx-gutter" icon="information-circle-outline">
        <Text variant="footnote">
          The server learns the push token of this phone and when a message arrives. Matrix gives it
          the room and event ids only, and Telegram messages reach it encrypted for this phone. The
          notification shows who wrote and what once this phone has fetched or decrypted it. XMTP,
          Nostr and Status messages wait until you open the app.
        </Text>
        <Button
          label="Run a push server"
          tone="neutral"
          onPress={() =>
            openExternal(guideUrl('homeserver', 'notifications-on-iphone')).catch(() => {})
          }
        />
      </Note>
    </>
  );
}

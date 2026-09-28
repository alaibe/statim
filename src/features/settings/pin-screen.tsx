import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import {
  Button,
  Chevron,
  cn,
  Icon,
  ListItem,
  Note,
  PinDots,
  PinPad,
  RowIcon,
  Section,
  Text,
  toast,
  useThemeColors,
} from '@/design';
import { reportError } from '@/core/app/report-error';
import { useAccountStore } from '@/core/account/account-store';
import { useLockStore } from '@/core/account/lock-store';
import { PIN_LENGTH } from '@/core/account/pin';
import { useWaitLeft, waitMessage } from '@/features/account/pin-wait';
import { leaveSettingsPage } from '@/features/navigation/open';
import { SettingsScreen } from '@/features/settings/settings-screen';

import {
  advancePinFlow,
  type PinFlowEvent,
  type SettingsPinFlow,
  type PinFlowState,
  pinFlowKind,
  type PinTask,
  startPinFlow,
} from '@/features/account/pin-flow';

const TITLE: Record<SettingsPinFlow, string> = {
  set: 'Set PIN',
  change: 'Change PIN',
  off: 'Turn off PIN',
};

const DONE: Record<SettingsPinFlow, string> = {
  set: 'PIN set. The app asks for it when it opens.',
  change: 'PIN changed',
  off: 'PIN turned off',
};

const FAILED: Record<PinTask['run'], string> = {
  check: 'Could not check the PIN. Try again.',
  save: 'Could not save the PIN. Try again.',
  remove: 'Could not turn the PIN off. Try again.',
};

const desktop = process.env.EXPO_OS === 'web';

export function PinRoute({ requested }: { requested: 'change' | 'off' }) {
  const setup = useLockStore((s) => s.setup);
  if (!setup) return null;
  return <PinScreen opening={pinFlowKind(requested, setup.pin)} />;
}

/** The flow is settled when the screen opens, so saving a new PIN does not turn it into a change. */
function PinScreen({ opening }: { opening: SettingsPinFlow }) {
  const [kind] = useState(opening);
  const focused = useIsFocused();
  const verifyPin = useLockStore((s) => s.verifyPin);
  const setPin = useLockStore((s) => s.setPin);
  const removePin = useLockStore((s) => s.removePin);

  const [state, setState] = useState(() => startPinFlow(kind));
  const send = (event: PinFlowEvent) => setState((current) => advancePinFlow(current, event));

  const perform = useEffectEvent(async (task: PinTask): Promise<PinFlowEvent> => {
    try {
      switch (task.run) {
        case 'check':
          return { type: 'checked', check: await verifyPin(task.pin) };
        case 'save':
          await setPin(task.pin);
          break;
        case 'remove':
          await removePin();
          break;
      }
      toast.success(DONE[kind]);
      leaveSettingsPage();
      return { type: 'finished' };
    } catch (error) {
      reportError(error);
      return { type: 'failed', message: FAILED[task.run] };
    }
  });

  const { task } = state;
  useEffect(() => {
    if (!task) return;
    let cancelled = false;
    void perform(task).then((event) => {
      if (!cancelled) setState((current) => advancePinFlow(current, event));
    });
    return () => {
      cancelled = true;
    };
  }, [task]);

  return (
    <SettingsScreen title={TITLE[kind]}>
      {state.stage.name === 'intro' ? (
        <PinIntro onBegin={() => send({ type: 'begin' })} />
      ) : (
        <PinEntry state={state} listening={focused} onEvent={send} />
      )}
    </SettingsScreen>
  );
}

function PinIntro({ onBegin }: { onBegin: () => void }) {
  const router = useRouter();
  const accounts = useAccountStore((s) => s.accounts.length);

  return (
    <View className="gap-5 px-gutter">
      <View className="items-center gap-3 pt-2">
        <View className="h-16 w-16 items-center justify-center rounded-full bg-brand-soft">
          <Icon name="keypad-outline" size={28} tone="brand" />
        </View>
        <Text variant="headline" className="text-center">
          Lock the app with a PIN
        </Text>
      </View>

      <View className="gap-3">
        <Text variant="bodyMuted">
          Statim asks for this {PIN_LENGTH}-digit PIN whenever it opens. It is separate from your{' '}
          {desktop ? 'computer’s password' : 'phone’s passcode'}, so knowing that does not open this
          app.
        </Text>
        <Text variant="bodyMuted">
          The PIN itself is never stored. The app keeps a one-way fingerprint of it{' '}
          {desktop ? 'in its encrypted vault' : 'in the keychain'}, which can check a PIN but cannot
          be turned back into one.
        </Text>
      </View>

      <Note tone="danger" icon="alert-circle" title="A forgotten PIN cannot be recovered">
        Nobody can reset it. The only way back in is to erase this app’s data on this device, then
        restore each account from its recovery phrase.
      </Note>

      <Section title="Before you go on" surface="card" inset={false}>
        <ListItem
          title="Recovery phrase"
          subtitle={
            accounts > 1
              ? 'Make sure each account’s phrase is written down'
              : 'Make sure it is written down'
          }
          numberOfLinesSubtitle={2}
          leading={<RowIcon name="key-outline" tone="orange" />}
          trailing={<Chevron />}
          onPress={() => router.push('/settings/recovery-phrase')}
        />
      </Section>

      <Button label="Choose a PIN" fullWidth onPress={onBegin} />
    </View>
  );
}

function PinEntry({
  state,
  listening,
  onEvent,
}: {
  state: PinFlowState;
  listening: boolean;
  onEvent: (event: PinFlowEvent) => void;
}) {
  const colors = useThemeColors();
  const waitLeft = useWaitLeft(state.note?.kind === 'wait' ? state.note.until : null);
  const { text, alarming } = describe(state, waitLeft);

  return (
    <View className="items-center gap-5 px-gutter pt-4">
      <View className="items-center gap-1.5">
        <Text variant="title">{prompt(state)}</Text>
        <View className="min-h-10 justify-center">
          {state.task?.run === 'check' ? (
            <ActivityIndicator color={colors['content-subtle']} />
          ) : (
            <Text variant="footnote" className={cn('text-center', alarming && 'text-danger')}>
              {text}
            </Text>
          )}
        </View>
      </View>

      <PinDots length={PIN_LENGTH} filled={state.digits.length} shakes={state.shakes} />

      <PinPad
        disabled={state.task !== null || waitLeft > 0 || state.stage.name === 'done'}
        listening={listening}
        onDigit={(digit) => onEvent({ type: 'digit', digit })}
        onDelete={() => onEvent({ type: 'delete' })}
      />
    </View>
  );
}

function prompt({ kind, stage }: PinFlowState): string {
  switch (stage.name) {
    case 'current':
      return kind === 'off' ? 'Enter your PIN' : 'Enter your current PIN';
    case 'choose':
      return kind === 'set' ? 'Choose a PIN' : 'Choose a new PIN';
    default:
      return 'Enter it again';
  }
}

function describe({ stage, note }: PinFlowState, waitLeft: number) {
  if (note?.kind === 'wait' && waitLeft > 0) return { text: waitMessage(waitLeft), alarming: true };
  if (note?.kind === 'mismatch') {
    return { text: 'Those PINs did not match. Choose one again.', alarming: true };
  }
  if (note?.kind === 'wrong') return { text: 'Wrong PIN. Try again.', alarming: true };
  if (note?.kind === 'failed') return { text: note.message, alarming: true };
  if (stage.name === 'choose') return { text: `${PIN_LENGTH} digits`, alarming: false };
  if (stage.name === 'confirm') return { text: 'The same digits, to be sure', alarming: false };
  return { text: '', alarming: false };
}

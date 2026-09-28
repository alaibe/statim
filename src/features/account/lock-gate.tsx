import { router } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, ScrollView, View } from 'react-native';

import {
  Button,
  cn,
  Field,
  Icon,
  type IconName,
  type IconTone,
  PinDots,
  PinPad,
  Screen,
  Text,
  useInertOutside,
  useThemeColors,
} from '@/design';
import { reportError } from '@/core/app/report-error';
import { eraseAllAccounts } from '@/core/app/erase-account';
import { useAccountStore } from '@/core/account/account-store';
import { isKeyProtectionEnabled } from '@/core/account/key-protection';
import { biometricCapability, type LockSetup, unlockMethod } from '@/core/account/lock';
import { useLockStore } from '@/core/account/lock-store';
import { PIN_LENGTH, pinLockedUntil } from '@/core/account/pin';
import { useAction } from '@/features/use-action';
import { useKeyedLoad } from '@/lib/use-keyed-load';

import { advancePinFlow, type PinFlowEvent, startPinFlow } from './pin-flow';
import { useWaitLeft, waitMessage } from './pin-wait';

const readProtection = () =>
  isKeyProtectionEnabled().catch((error: unknown) => {
    reportError(error);
    throw error;
  });

export function LockGate() {
  const shield = useRef<View>(null);
  useInertOutside(shield);

  return (
    <View ref={shield} className="absolute inset-0 bg-canvas">
      <LockScreen />
    </View>
  );
}

function LockScreen() {
  const setup = useLockStore((s) => s.setup);
  const evaluate = useLockStore((s) => s.evaluate);

  const [label, setLabel] = useState('Face ID');
  const [checks, setChecks] = useState(0);
  const protection = useKeyedLoad('key-protection', readProtection, checks);

  useEffect(() => {
    biometricCapability()
      .then((c) => setLabel(c.label))
      .catch(reportError);
  }, []);

  if (!setup || protection.error !== undefined) {
    return (
      <LockFrame
        icon="lock-closed-outline"
        tone="danger"
        message="Could not check how this app is locked.">
        <Button
          label="Try again"
          onPress={async () => {
            setChecks((n) => n + 1);
            if (!setup) await evaluate();
          }}
        />
      </LockFrame>
    );
  }
  if (protection.value === undefined) return <LockFrame icon="lock-closed-outline" />;
  if (protection.value) return <ProtectedKeysUnlock label={label} />;
  return <Unlock setup={setup} label={label} />;
}

function Unlock({ setup, label }: { setup: LockSetup; label: string }) {
  const open = useLockStore((s) => s.noteJustAuthenticated);
  const [method, setMethod] = useState(() => unlockMethod(setup));

  useEffect(() => {
    if (method === null) open();
  }, [method, open]);

  if (method === 'pin') {
    return (
      <PinUnlock
        backToBiometrics={setup.biometric ? { label, go: () => setMethod('biometric') } : null}
      />
    );
  }
  if (method === 'biometric') {
    return <BiometricUnlock label={label} toPin={setup.pin ? () => setMethod('pin') : null} />;
  }
  return <LockFrame icon="lock-closed-outline" />;
}

/**
 * Re-prompts when the user comes back from another app, not when the prompt
 * itself hands focus back: that would re-open it the moment it is dismissed.
 */
function useOnReturnFromBackground(onReturn: () => void) {
  const handler = useEffectEvent(onReturn);
  const last = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const previous = last.current;
      last.current = next;
      if (next === 'active' && previous === 'background') handler();
    });
    return () => subscription.remove();
  }, []);
}

function BiometricUnlock({ label, toPin }: { label: string; toPin: (() => void) | null }) {
  const prompting = useLockStore((s) => s.prompting);
  const unlock = useLockStore((s) => s.unlock);
  const [failed, setFailed] = useState(false);

  const attempt = useCallback(async () => {
    setFailed(false);
    try {
      const outcome = await unlock();
      if (outcome === 'use-pin' && toPin) toPin();
      else if (outcome !== 'passed') setFailed(true);
    } catch (error) {
      reportError(error);
      setFailed(true);
    }
  }, [unlock, toPin]);

  const attemptOnce = useEffectEvent(() => void attempt());
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) attemptOnce();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useOnReturnFromBackground(() => {
    if (!useLockStore.getState().prompting) void attempt();
  });

  return (
    <LockFrame
      icon={failed ? 'lock-closed-outline' : 'finger-print-outline'}
      tone={failed ? 'danger' : 'muted'}
      message={failed ? `${label} was not recognised.` : `Unlocking with ${label}…`}>
      {failed ? (
        <View className="w-full max-w-[280px] gap-2">
          <Button label="Try again" fullWidth disabled={prompting} onPress={attempt} />
          {toPin ? <Button label="Use PIN" tone="neutral" fullWidth onPress={toPin} /> : null}
        </View>
      ) : (
        <Spinner />
      )}
    </LockFrame>
  );
}

/** Keys sealed behind biometrics are read by the account store, and a PIN cannot unseal them. */
function ProtectedKeysUnlock({ label }: { label: string }) {
  const prompting = useLockStore((s) => s.prompting);
  const open = useLockStore((s) => s.noteJustAuthenticated);
  const accountStatus = useAccountStore((s) => s.status);
  const retryUnlock = useAccountStore((s) => s.retryUnlock);
  const [failed, setFailed] = useState(false);

  const attempt = useCallback(async () => {
    setFailed(false);
    try {
      if (!(await retryUnlock())) setFailed(true);
    } catch (error) {
      reportError(error);
      setFailed(true);
    }
  }, [retryUnlock]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (accountStatus === 'ready' || accountStatus === 'invalidated') open();
      else if (accountStatus === 'blocked') setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [accountStatus, open]);

  useOnReturnFromBackground(() => {
    if (useAccountStore.getState().status === 'blocked') void attempt();
  });

  return (
    <LockFrame
      icon={failed ? 'lock-closed-outline' : 'finger-print-outline'}
      tone={failed ? 'danger' : 'muted'}
      message={
        failed
          ? `${label} was not recognised. Your keys can only be read with ${label}.`
          : `Unlocking with ${label}…`
      }>
      {failed ? <Button label="Try again" disabled={prompting} onPress={attempt} /> : <Spinner />}
    </LockFrame>
  );
}

function PinUnlock({
  backToBiometrics,
}: {
  backToBiometrics: { label: string; go: () => void } | null;
}) {
  const verifyPin = useLockStore((s) => s.verifyPin);
  const [state, setState] = useState(() => startPinFlow('unlock'));
  const [forgotten, setForgotten] = useState(false);
  const send = (event: PinFlowEvent) => setState((current) => advancePinFlow(current, event));
  const waitLeft = useWaitLeft(state.note?.kind === 'wait' ? state.note.until : null);

  useEffect(() => {
    pinLockedUntil()
      .then((until) => {
        if (until !== null) setState((current) => advancePinFlow(current, { type: 'wait', until }));
      })
      .catch(reportError);
  }, []);

  const { task } = state;
  useEffect(() => {
    if (task?.run !== 'check') return;
    let cancelled = false;
    void verifyPin(task.pin)
      .then(
        (check): PinFlowEvent => ({ type: 'checked', check }),
        (error: unknown): PinFlowEvent => {
          reportError(error);
          return { type: 'failed', message: 'Could not check the PIN. Try again.' };
        }
      )
      .then((event) => {
        if (!cancelled) setState((current) => advancePinFlow(current, event));
      });
    return () => {
      cancelled = true;
    };
  }, [task, verifyPin]);

  if (forgotten) return <ForgotPin onCancel={() => setForgotten(false)} />;

  const { note } = state;
  const message =
    note?.kind === 'wait' && waitLeft > 0
      ? waitMessage(waitLeft)
      : note?.kind === 'wrong'
        ? 'Wrong PIN. Try again.'
        : note?.kind === 'failed'
          ? note.message
          : null;

  return (
    <LockFrame icon="lock-closed-outline" title="Enter your PIN">
      <View className="min-h-10 justify-center">
        {task ? (
          <Spinner />
        ) : (
          <Text variant="footnote" className={cn('text-center', message && 'text-danger')}>
            {message ?? 'Status Original is locked'}
          </Text>
        )}
      </View>

      <PinDots length={PIN_LENGTH} filled={state.digits.length} shakes={state.shakes} />

      <PinPad
        disabled={task !== null || waitLeft > 0}
        onDigit={(digit) => send({ type: 'digit', digit })}
        onDelete={() => send({ type: 'delete' })}
        extra={
          backToBiometrics
            ? {
                label: `Use ${backToBiometrics.label}`,
                icon: 'finger-print-outline',
                onPress: backToBiometrics.go,
              }
            : undefined
        }
      />

      <Button label="Forgot PIN?" tone="ghost" size="sm" onPress={() => setForgotten(true)} />
    </LockFrame>
  );
}

const ERASE_WORD = 'erase';

function ForgotPin({ onCancel }: { onCancel: () => void }) {
  const [typed, setTyped] = useState('');
  const erase = useAction(
    async () => {
      await eraseAllAccounts();
      router.replace('/(onboarding)/welcome');
    },
    { failure: 'Could not erase this device' }
  );
  const armed = typed.trim().toLowerCase() === ERASE_WORD;

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="grow justify-center gap-5 px-gutter py-8">
          <View className="items-center gap-3">
            <IconBadge icon="trash-outline" tone="danger" />
            <Text variant="headline" className="text-center">
              Erase everything?
            </Text>
          </View>

          <Text variant="bodyMuted">
            A forgotten PIN cannot be reset. To use Status Original again, erase everything it keeps
            on this device: every account’s keys, chats and settings.
          </Text>
          <Text variant="bodyMuted">
            Then restore each account from its recovery phrase. Notes and anything else kept only on
            this device are gone for good.
          </Text>

          <Field
            label={`Type “${ERASE_WORD}” to confirm`}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            testID="forgot-pin-confirm"
          />

          <View className="gap-2">
            <Button
              testID="forgot-pin-erase"
              label="Erase everything"
              tone="danger"
              fullWidth
              disabled={!armed}
              loading={erase.busy}
              onPress={() => erase.run()}
            />
            <Button
              label="Cancel"
              tone="neutral"
              fullWidth
              disabled={erase.busy}
              onPress={onCancel}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function LockFrame({
  icon,
  tone = 'muted',
  title = 'Status Original',
  message,
  children,
}: {
  icon: IconName;
  tone?: IconTone;
  title?: string;
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <Screen className="items-center justify-center gap-6">
      <IconBadge icon={icon} tone={tone} />

      <View className="items-center gap-1.5 px-gutter">
        <Text variant="title">{title}</Text>
        {message ? (
          <Text variant="footnote" className="text-center">
            {message}
          </Text>
        ) : null}
      </View>

      {children}
    </Screen>
  );
}

function IconBadge({ icon, tone }: { icon: IconName; tone: IconTone }) {
  return (
    <View className="h-20 w-20 items-center justify-center rounded-full bg-surface-sunken">
      <Icon name={icon} size={34} tone={tone} />
    </View>
  );
}

function Spinner() {
  const colors = useThemeColors();
  return <ActivityIndicator color={colors['content-subtle']} />;
}

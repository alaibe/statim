import { useState } from 'react';
import type { TextInputProps } from 'react-native';

import { Button, Card, Field, Text } from '@/design';
import type { ChatSession, LoginState } from '@/core/messaging/protocol';
import { useAction } from '@/features/use-action';

const COPY: Record<
  LoginState['step'],
  { label: string; placeholder: string; action: string } & Pick<
    TextInputProps,
    'keyboardType' | 'autoComplete' | 'textContentType'
  >
> = {
  phone: {
    label: 'Phone number',
    placeholder: '+44 7700 900123',
    action: 'Send code',
    keyboardType: 'phone-pad',
    autoComplete: 'tel',
    textContentType: 'telephoneNumber',
  },
  code: {
    label: 'Code',
    placeholder: '12345',
    action: 'Continue',
    keyboardType: 'number-pad',
    autoComplete: 'one-time-code',
    textContentType: 'oneTimeCode',
  },
  password: {
    label: 'Password',
    placeholder: 'Your password',
    action: 'Sign in',
    keyboardType: 'default',
    autoComplete: 'password',
    textContentType: 'password',
  },
};

/**
 * One step of an interactive sign-in, driven by whatever the session is
 * waiting on. Key it by step so the field starts empty at each one.
 */
export function LoginStep({
  login,
  session,
  label,
}: {
  login: LoginState;
  session: ChatSession | undefined;
  label: string;
}) {
  const [value, setValue] = useState('');
  const copy = COPY[login.step];
  const submitLogin = useAction(async () => session?.submitLogin?.(value), {
    failure: `${label} did not accept that`,
  });

  function submit() {
    if (value.trim().length > 0) void submitLogin.run();
  }

  return (
    <Card className="gap-3" testID="protocol-login">
      <Text variant="footnote" className="font-semibold">
        {login.title ?? `Sign in to ${label}`}
      </Text>
      <Field
        testID={`protocol-login-${login.step}`}
        label={copy.label}
        placeholder={copy.placeholder}
        hint={login.hint}
        error={login.error}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        keyboardType={copy.keyboardType}
        secureTextEntry={login.step === 'password'}
        autoComplete={copy.autoComplete}
        textContentType={copy.textContentType}
      />
      <Button
        testID="protocol-login-submit"
        label={copy.action}
        size="md"
        fullWidth
        loading={submitLogin.busy}
        disabled={value.trim().length === 0}
        onPress={submit}
      />
    </Card>
  );
}

export function SignedIn({ session, label }: { session: ChatSession; label: string }) {
  const signOut = useAction(async () => session.signOut?.(), {
    success: `Signed out of ${label}`,
    failure: 'Could not sign out',
  });

  return (
    <Card className="gap-2" testID="protocol-signed-in">
      <Text variant="footnote" className="font-semibold">
        Signed in as {session.self.address}
      </Text>
      <Text variant="caption">
        Signing out ends this session on {label} as well and removes its data from this device.
      </Text>
      {session.signOut ? (
        <Button label="Sign out" tone="neutral" size="sm" onPress={() => signOut.run()} />
      ) : null}
    </Card>
  );
}

import { useState } from "react";
import { type TextInputProps, View } from "react-native";
import type { ChatSession, LoginState } from "@/core/messaging/protocol";
import { Button, Input, Text } from "@/design";
import { useAction } from "@/features/use-action";

const COPY: Record<
  LoginState["step"],
  { label: string; placeholder: string; action: string; mono: boolean } & Pick<
    TextInputProps,
    "keyboardType" | "autoComplete" | "textContentType"
  >
> = {
  phone: {
    label: "Phone number",
    placeholder: "+44 7700 900123",
    action: "Send code",
    mono: true,
    keyboardType: "phone-pad",
    autoComplete: "tel",
    textContentType: "telephoneNumber",
  },
  code: {
    label: "Code",
    placeholder: "12345",
    action: "Continue",
    mono: true,
    keyboardType: "number-pad",
    autoComplete: "one-time-code",
    textContentType: "oneTimeCode",
  },
  password: {
    label: "Password",
    placeholder: "Your password",
    action: "Sign in",
    mono: false,
    keyboardType: "default",
    autoComplete: "password",
    textContentType: "password",
  },
};

/** Key it by step so the field starts empty at each one. */
export function LoginStep({
  login,
  session,
  label,
}: {
  login: LoginState;
  session: ChatSession | undefined;
  label: string;
}) {
  const [value, setValue] = useState("");
  const copy = COPY[login.step];
  const submitLogin = useAction(async () => session?.submitLogin?.(value), {
    failure: `${label} didn't accept that`,
  });

  function submit() {
    if (value.trim().length > 0) void submitLogin.run();
  }

  return (
    <View className="gap-3" testID="protocol-login">
      <Text variant="heading">{login.title ?? `Sign in to ${label}`}</Text>
      <Input
        testID={`protocol-login-${login.step}`}
        label={copy.label}
        mono={copy.mono}
        placeholder={copy.placeholder}
        help={login.hint}
        error={login.error}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        keyboardType={copy.keyboardType}
        secureTextEntry={login.step === "password"}
        autoComplete={copy.autoComplete}
        textContentType={copy.textContentType}
      />
      <Button
        testID="protocol-login-submit"
        variant="primary"
        label={copy.action}
        fullWidth
        busy={submitLogin.busy}
        disabled={value.trim().length === 0}
        onPress={submit}
      />
    </View>
  );
}

export function SignedIn({ session, label }: { session: ChatSession; label: string }) {
  const signOut = useAction(async () => session.signOut?.(), {
    success: `Signed out of ${label}`,
    failure: "Couldn't sign out",
  });

  return (
    <View className="gap-2" testID="protocol-signed-in">
      <Text variant="label">Signed in as</Text>
      <Text variant="code" selectable>
        {session.self.address}
      </Text>
      <Text size="sm" tone="muted">
        Signing out ends this session on {label} as well and removes its data from this device.
      </Text>
      {session.signOut ? (
        <Button label="Sign out" variant="danger" size="sm" busy={signOut.busy} onPress={() => signOut.run()} />
      ) : null}
    </View>
  );
}

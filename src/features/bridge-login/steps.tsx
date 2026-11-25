import { useState } from "react";
import { View } from "react-native";

import { Button, Icon, Input, LitPoint, QrCode, Radio, Row, Tag, Text } from "@/design";
import type { InputField, LoginStep, Whoami } from "@/protocols/matrix/provisioning";

export function InputStep({
  step,
  busy,
  onSubmit,
}: {
  step: LoginStep;
  busy: boolean;
  onSubmit: (values: Record<string, string>) => void;
}) {
  const fields = step.user_input?.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.id, field.default_value ?? ""])),
  );
  const ready = fields.every((field) => valid(field, values[field.id] ?? ""));
  const submit = () => {
    if (ready && !busy) onSubmit(values);
  };

  return (
    <View className="gap-3">
      {fields.map((field, index) =>
        field.type === "select" ? (
          <View key={field.id} className="gap-2">
            <Text variant="label">{field.name}</Text>
            <View className="-mx-4">
              {(field.options ?? []).map((option) => (
                <Row
                  key={option}
                  title={option}
                  leading={<Radio checked={values[field.id] === option} />}
                  onPress={() => setValues((current) => ({ ...current, [field.id]: option }))}
                />
              ))}
            </View>
          </View>
        ) : (
          <Input
            key={field.id}
            testID={`bridge-login-${field.id}`}
            label={field.name}
            help={field.description}
            mono={field.type !== "password" && field.type !== "email"}
            value={values[field.id] ?? ""}
            onChangeText={(text) => setValues((current) => ({ ...current, [field.id]: text }))}
            onSubmitEditing={submit}
            autoFocus={index === 0}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            secureTextEntry={field.type === "password"}
            keyboardType={KEYBOARD[field.type] ?? "default"}
            autoComplete={AUTOCOMPLETE[field.type]}
          />
        ),
      )}
      <Button
        testID="bridge-login-submit"
        variant="primary"
        label="Continue"
        fullWidth
        busy={busy}
        disabled={!ready}
        onPress={submit}
      />
    </View>
  );
}

export function WaitStep({ step }: { step: LoginStep }) {
  const display = step.display_and_wait;

  return (
    <View className="items-center gap-4">
      {display?.type === "qr" && display.data ? (
        <QrCode value={display.data} />
      ) : display?.data ? (
        <Text variant="title" align="center" selectable>
          {display.data}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-2">
        <LitPoint pulse />
        <Text variant="meta">Waiting…</Text>
      </View>
    </View>
  );
}

function valid(field: InputField, value: string): boolean {
  if (!value) return false;
  if (!field.pattern) return true;
  try {
    return new RegExp(field.pattern).test(value);
  } catch {
    return true;
  }
}

const KEYBOARD: Partial<Record<InputField["type"], "email-address" | "phone-pad" | "number-pad" | "url">> = {
  email: "email-address",
  phone_number: "phone-pad",
  url: "url",
};

const AUTOCOMPLETE: Partial<Record<InputField["type"], "email" | "tel" | "password" | "username" | "one-time-code">> = {
  email: "email",
  phone_number: "tel",
  password: "password",
  username: "username",
  "2fa_code": "one-time-code",
};

export function FlowPicker({
  whoami,
  network,
  preferred,
  onPick,
}: {
  whoami: Whoami | null;
  network: string;
  preferred: string | undefined;
  onPick: (flowId: string) => void;
}) {
  const flows = [...(whoami?.login_flows ?? [])].sort(
    (a, b) => Number(b.id === preferred) - Number(a.id === preferred),
  );

  return (
    <>
      {whoami && whoami.logins.length > 0 ? (
        <View className="gap-1">
          <Text strong>Signed in as {whoami.logins.map((login) => login.name || login.id).join(", ")}</Text>
          <Text size="sm" tone="muted">
            Sign in again to add another account.
          </Text>
        </View>
      ) : null}
      <Text variant="label">How do you want to sign in to {network}?</Text>
      <View className="-mx-4">
        {flows.map((flow) => (
          <Row
            key={flow.id}
            testID={`bridge-flow-${flow.id}`}
            title={flow.name}
            preview={flow.description}
            previewLines={2}
            tags={flow.id === preferred ? <Tag tone="accent" label="Recommended" /> : undefined}
            trailing={<Icon name="chevron-right" size={16} tone="muted" />}
            onPress={() => onPick(flow.id)}
          />
        ))}
      </View>
    </>
  );
}

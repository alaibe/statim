import { errorMessage } from "@/core/errors";
import { loadProtocolConfig, missingFields, withDefaults } from "@/core/messaging/config";
import type { ProtocolDescriptor } from "@/core/messaging/registry";
import { Button, Input, Notice, Skeleton, Text } from "@/design";
import { useAction } from "@/features/use-action";
import { useKeyedLoad } from "@/lib/use-keyed-load";
import { accountRuntime } from "@/runtime";

export function ProtocolConfigForm({
  accountId,
  descriptor,
  primary = true,
  onSaved,
}: {
  accountId: string;
  descriptor: ProtocolDescriptor;
  /** Saving is the page's action unless a sign-in step is waiting. */
  primary?: boolean;
  onSaved(): void;
}) {
  const loaded = useKeyedLoad(`${accountId}/${descriptor.id}`, () =>
    loadProtocolConfig(accountId, descriptor.id).then((stored) => withDefaults(descriptor.configSchema, stored)),
  );
  const config = loaded.value;
  const save = useAction(
    async () => {
      if (!config) return;
      await accountRuntime.updateProtocolConfig(accountId, descriptor.id, config);
      onSaved();
    },
    { success: `Saved the ${descriptor.label} settings`, failure: "Couldn't save those settings" },
  );

  if (loaded.error) {
    return <Notice tone="danger" message={errorMessage(loaded.error, "Couldn't read these settings")} />;
  }
  if (!config) return <Skeleton rows={2} lines={1} />;

  const missing = missingFields(descriptor.configSchema, config);

  return (
    <>
      {descriptor.configSchema.fields.map((field) => (
        <Input
          key={field.key}
          testID={`protocol-field-${field.key}`}
          label={field.label}
          placeholder={field.placeholder}
          help={field.help}
          mono={field.kind !== "lines"}
          defaultValue={config[field.key] ?? ""}
          onChangeText={(text) => loaded.update((current) => ({ ...current, [field.key]: text }))}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          secureTextEntry={field.kind === "secret"}
          multiline={field.kind === "lines"}
          numberOfLines={field.kind === "lines" ? 5 : 1}
        />
      ))}

      {missing.length > 0 ? (
        <Text size="sm" tone="muted">
          {`${descriptor.label} stays disconnected until ${missing
            .map((f) => f.label)
            .join(" and ")} ${missing.length === 1 ? "is" : "are"} filled in.`}
        </Text>
      ) : null}

      <Button
        testID="protocol-save"
        variant={primary ? "primary" : "secondary"}
        label="Save and reconnect"
        fullWidth
        busy={save.busy}
        onPress={() => save.run()}
      />
    </>
  );
}

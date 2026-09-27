import { Button, ErrorText, Field, Loading, Text } from '@/design';
import { errorMessage } from '@/core/errors';
import { loadProtocolConfig, missingFields, withDefaults } from '@/core/messaging/config';
import type { ProtocolDescriptor } from '@/core/messaging/registry';
import { useAction } from '@/features/use-action';
import { useKeyedLoad } from '@/lib/use-keyed-load';
import { accountRuntime } from '@/runtime';

export function ProtocolConfigForm({
  accountId,
  descriptor,
}: {
  accountId: string;
  descriptor: ProtocolDescriptor;
}) {
  const loaded = useKeyedLoad(`${accountId}/${descriptor.id}`, () =>
    loadProtocolConfig(accountId, descriptor.id).then((stored) =>
      withDefaults(descriptor.configSchema, stored)
    )
  );
  const config = loaded.value;
  const save = useAction(
    async () => {
      if (config) await accountRuntime.updateProtocolConfig(accountId, descriptor.id, config);
    },
    { success: `${descriptor.label} settings saved`, failure: 'Could not save those settings' }
  );

  if (loaded.error) {
    return <ErrorText>{errorMessage(loaded.error, 'Could not read these settings')}</ErrorText>;
  }
  if (!config) return <Loading className="py-4" />;

  const missing = missingFields(descriptor.configSchema, config);

  return (
    <>
      {descriptor.configSchema.fields.map((field) => (
        <Field
          key={field.key}
          testID={`protocol-field-${field.key}`}
          label={field.label}
          placeholder={field.placeholder}
          hint={field.help}
          defaultValue={config[field.key] ?? ''}
          onChangeText={(text) => loaded.update((current) => ({ ...current, [field.key]: text }))}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          secureTextEntry={field.kind === 'secret'}
          multiline={field.kind === 'lines'}
          numberOfLines={field.kind === 'lines' ? 5 : 1}
          className={field.kind === 'lines' ? 'min-h-[110px]' : undefined}
        />
      ))}

      {missing.length > 0 ? (
        <Text variant="caption">
          {`${descriptor.label} stays disconnected until ${missing
            .map((f) => f.label)
            .join(' and ')} ${missing.length === 1 ? 'is' : 'are'} filled in.`}
        </Text>
      ) : null}

      <Button
        testID="protocol-save"
        label="Save and reconnect"
        size="md"
        fullWidth
        onPress={() => save.run()}
      />
    </>
  );
}

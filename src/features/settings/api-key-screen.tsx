import { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Note, Section, Text, toast } from '@/design';
import { useIdentityStore } from '@/core/identity/identity-store';
import { errorMessage } from '@/core/errors';
import { openExternal } from '@/lib/open-url';
import { useKeyedLoad } from '@/lib/use-keyed-load';

import { SettingsScreen } from './settings-screen';

export interface ApiKeyScreenProps {
  title: string;
  sectionTitle: string;
  testIdPrefix: string;
  placeholder: string;
  load(accountId: string): Promise<string | null>;
  save(accountId: string, key: string): Promise<void>;
  /** Toasted after a non-empty key is saved. */
  savedMessage: string;
  notes: string[];
  link: { label: string; url: string };
}

export function ApiKeyScreen({
  title,
  sectionTitle,
  testIdPrefix,
  placeholder,
  load,
  save,
  savedMessage,
  notes,
  link,
}: ApiKeyScreenProps) {
  const accountId = useIdentityStore((s) => s.activeAccountId);
  const [version, setVersion] = useState(0);
  const stored = useKeyedLoad(accountId, load, version);
  const saved = stored.loading ? undefined : (stored.value ?? null);
  const [draft, setDraft] = useState<{ accountId: string | null; text: string } | null>(null);
  const key = draft?.accountId === accountId ? draft.text : (saved ?? '');
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    if (!accountId) {
      toast.error('No account is active yet.');
      return;
    }
    const next = value.trim() === '' ? null : value.trim();
    const done = next ? savedMessage : 'Key removed';
    setBusy(true);
    try {
      await save(accountId, value);
      setVersion((v) => v + 1);
      toast.success(done);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save that key'));
    }
    setBusy(false);
  }

  return (
    <SettingsScreen title={title}>
      {saved === undefined ? null : (
        <Section title={sectionTitle} surface="card" className="mb-6">
          <View className="gap-3 px-gutter py-4">
            <Field
              testID={testIdPrefix}
              value={key}
              onChangeText={(text) => setDraft({ accountId, text })}
              placeholder={placeholder}
              autoCorrect={false}
              autoCapitalize="none"
              hint={saved ? 'A key is saved for this account.' : 'No key yet.'}
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  testID={`${testIdPrefix}-save`}
                  label="Save"
                  fullWidth
                  loading={busy}
                  disabled={busy || key.trim() === (saved ?? '')}
                  onPress={() => submit(key)}
                />
              </View>
              {saved ? (
                <View className="flex-1">
                  <Button
                    testID={`${testIdPrefix}-clear`}
                    label="Remove"
                    tone="neutral"
                    fullWidth
                    disabled={busy}
                    onPress={() => {
                      setDraft({ accountId, text: '' });
                      submit('');
                    }}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </Section>
      )}

      <Note className="mx-gutter" icon="information-circle-outline">
        {notes.map((note) => (
          <Text key={note} variant="footnote">
            {note}
          </Text>
        ))}
        <Button
          label={link.label}
          tone="neutral"
          onPress={() => openExternal(link.url).catch(() => {})}
        />
      </Note>
    </SettingsScreen>
  );
}

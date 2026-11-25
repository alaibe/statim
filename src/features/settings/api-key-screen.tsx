import { useState } from "react";
import { View } from "react-native";
import { useAccountStore } from "@/core/account/account-store";
import { Button, Field, Note, Section, Text, toast } from "@/design";
import { useAction } from "@/features/use-action";
import { openExternal } from "@/lib/open-url";
import { useKeyedLoad } from "@/lib/use-keyed-load";
import { SettingsScreen } from "./settings-screen";

interface ApiKeySectionProps {
  sectionTitle: string;
  testIdPrefix: string;
  placeholder: string;
  load(accountId: string): Promise<string | null>;
  save(accountId: string, key: string): Promise<void>;
  savedMessage: string;
  notes: string[];
  link: { label: string; url: string };
}

export function ApiKeyScreen({ title, ...section }: ApiKeySectionProps & { title: string }) {
  return (
    <SettingsScreen title={title}>
      <ApiKeySection {...section} />
    </SettingsScreen>
  );
}

export function ApiKeySection({
  sectionTitle,
  testIdPrefix,
  placeholder,
  load,
  save,
  savedMessage,
  notes,
  link,
}: ApiKeySectionProps) {
  const accountId = useAccountStore((s) => s.activeAccountId);
  const [version, setVersion] = useState(0);
  const stored = useKeyedLoad(accountId, load, version);
  const saved = stored.loading ? undefined : (stored.value ?? null);
  const [draft, setDraft] = useState<{ accountId: string | null; text: string } | null>(null);
  const key = draft?.accountId === accountId ? draft.text : (saved ?? "");
  const submit = useAction(
    async (value: string) => {
      if (!accountId) throw new Error("No account is active yet.");
      await save(accountId, value);
      setVersion((v) => v + 1);
      toast.success(value.trim() ? savedMessage : "Key removed");
    },
    { failure: "Could not save that key" },
  );

  return (
    <>
      {saved === undefined ? null : (
        <Section title={sectionTitle} surface="card" className="mb-6">
          <View className="gap-3 px-4 py-4">
            <Field
              testID={testIdPrefix}
              value={key}
              onChangeText={(text) => setDraft({ accountId, text })}
              placeholder={placeholder}
              autoCorrect={false}
              autoCapitalize="none"
              hint={saved ? "A key is saved for this account." : "No key yet."}
            />
            <View className="flex-row gap-2">
              <View className="flex-1">
                <Button
                  testID={`${testIdPrefix}-save`}
                  label="Save"
                  fullWidth
                  loading={submit.busy}
                  disabled={submit.busy || key.trim() === (saved ?? "")}
                  onPress={() => submit.run(key)}
                />
              </View>
              {saved ? (
                <View className="flex-1">
                  <Button
                    testID={`${testIdPrefix}-clear`}
                    label="Remove"
                    tone="neutral"
                    fullWidth
                    disabled={submit.busy}
                    onPress={() => {
                      setDraft({ accountId, text: "" });
                      return submit.run("");
                    }}
                  />
                </View>
              ) : null}
            </View>
          </View>
        </Section>
      )}

      <Note className="mx-4" icon="information-circle-outline">
        {notes.map((note) => (
          <Text key={note} variant="footnote">
            {note}
          </Text>
        ))}
        <Button label={link.label} tone="neutral" onPress={() => openExternal(link.url).catch(() => {})} />
      </Note>
    </>
  );
}

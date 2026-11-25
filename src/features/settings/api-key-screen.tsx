import { useState } from "react";
import { View } from "react-native";
import { useAccountStore } from "@/core/account/account-store";
import { Button, desktop, Input, Section, Text, toast } from "@/design";
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
  // Trades holds two keys, so only the one being edited is the screen's primary action.
  const unchanged = key.trim() === (saved ?? "");
  const submit = useAction(
    async (value: string) => {
      if (!accountId) throw new Error("No account is active yet.");
      await save(accountId, value);
      setVersion((v) => v + 1);
      toast.success(value.trim() ? savedMessage : "Removed the key");
    },
    { failure: "Couldn't save that key" },
  );

  return (
    <Section label={sectionTitle}>
      {saved === undefined ? null : (
        <View className={desktop ? "gap-3 py-3" : "gap-3 p-4"}>
          <Input
            testID={testIdPrefix}
            mono
            value={key}
            onChangeText={(text) => setDraft({ accountId, text })}
            placeholder={placeholder}
            autoCorrect={false}
            autoCapitalize="none"
            help={saved ? "A key is saved for this account." : "No key yet."}
          />
          <View className="flex-row justify-end gap-2">
            {saved ? (
              <Button
                testID={`${testIdPrefix}-clear`}
                label="Remove"
                disabled={submit.busy}
                onPress={() => {
                  setDraft({ accountId, text: "" });
                  return submit.run("");
                }}
              />
            ) : null}
            <Button
              testID={`${testIdPrefix}-save`}
              variant={unchanged ? "secondary" : "primary"}
              label="Save"
              busy={submit.busy}
              disabled={unchanged}
              onPress={() => submit.run(key)}
            />
          </View>
        </View>
      )}
      <View className={desktop ? "gap-3 py-3" : "gap-3 p-4"}>
        {notes.map((note) => (
          <Text key={note} size="sm" tone="muted">
            {note}
          </Text>
        ))}
        <Button
          label={link.label}
          trailingIcon="arrow-up-right"
          onPress={() => openExternal(link.url).catch(() => {})}
        />
      </View>
    </Section>
  );
}

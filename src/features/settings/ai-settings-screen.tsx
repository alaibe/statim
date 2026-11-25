import { useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { useAccountStore } from "@/core/account/account-store";
import { readCredentials } from "@/core/account/credentials";
import {
  type AiConfig,
  type AiSource,
  aiConfigRevision,
  loadAiConfig,
  saveAiConfig,
  saveAiKey,
  saveTypesafeKey,
  subscribeAiConfig,
} from "@/core/ai/config";
import { DEVICE_MODEL_NAME, type DeviceModelState, deviceModelState } from "@/core/ai/device";
import { OLLAMA_URL, providerFor } from "@/core/ai/providers";
import { DEFAULT_ANTHROPIC_MODEL } from "@/core/ai/providers/anthropic";
import { listModels } from "@/core/ai/providers/openai";
import { useAppearanceStore } from "@/core/app/appearance";
import { Button, desktop, Input, Radio, Row, SECTION_GAP, Section, SettingsRow, Text, toast } from "@/design";
import { useAction } from "@/features/use-action";
import { guideUrl } from "@/lib/guide";
import { openExternal } from "@/lib/open-url";
import { useKeyedLoad } from "@/lib/use-keyed-load";
import { SettingsScreen } from "./settings-screen";

const DESKTOP = desktop;

const JEV_FEATURES = [
  {
    flag: "suggestOnOpen",
    testID: "ai-suggest-on-open",
    title: "Suggest replies on open",
    subtitle: "Jev checks whether you need to reply. Your selected AI writes a suggestion for you to review.",
  },
  {
    flag: "replyBadges",
    testID: "ai-reply-badges",
    title: "Highlight chats needing a reply",
    subtitle: "Show a Reply needed badge in the chat list.",
  },
  {
    flag: "followUps",
    testID: "ai-follow-ups",
    title: "Suggest follow-ups",
    subtitle:
      "After a day without an answer, show a Follow up badge and suggest a polite nudge when you open the chat.",
  },
  {
    flag: "suggestActions",
    testID: "ai-suggest-actions",
    title: "Suggest useful AI actions",
    subtitle:
      "Highlight Summarize or Translate when it would help with the open chat. The action runs when you tap it.",
  },
] as const;

type JevFlag = (typeof JEV_FEATURES)[number]["flag"];

interface Draft extends Omit<AiConfig, JevFlag>, Record<JevFlag, boolean> {
  key: string;
  typesafeKey: string;
}

interface Saved {
  draft: Draft;
  device: DeviceModelState;
}

async function loadSaved(accountId: string): Promise<Saved> {
  const [config, credentials, device] = await Promise.all([
    loadAiConfig(accountId),
    readCredentials(accountId),
    deviceModelState(),
  ]);
  return {
    draft: {
      ...config,
      suggestOnOpen: config.suggestOnOpen ?? false,
      replyBadges: config.replyBadges ?? false,
      followUps: config.followUps ?? false,
      suggestActions: config.suggestActions ?? false,
      key: credentials.ai ?? "",
      typesafeKey: credentials.typesafe ?? "",
    },
    device,
  };
}

function automaticHint(device: DeviceModelState): string {
  const ollama = DESKTOP ? ", or Ollama on this computer when it runs" : "";
  switch (device) {
    case "ready":
      return `${DEVICE_MODEL_NAME} on this device. Nothing you ask leaves it.`;
    case "off":
      return `${DEVICE_MODEL_NAME}, which is off on this device${ollama}`;
    case "downloading":
      return `${DEVICE_MODEL_NAME}, still downloading${ollama}`;
    case "unsupported":
      return DESKTOP ? "Ollama on this computer, when it runs" : "This device has no model of its own";
  }
}

const SOURCES: { id: AiSource; title: string; hint?: string }[] = [
  { id: "auto", title: "Automatic" },
  { id: "openai", title: "Your server", hint: "Ollama, llama.cpp, LM Studio, OpenAI, OpenRouter" },
  { id: "anthropic", title: "Anthropic", hint: "Claude, with your API key" },
];

const FORM: Record<Exclude<AiSource, "auto">, { title: string; key: string; model: string }> = {
  openai: { title: "Server", key: "Only if the server asks for one", model: "llama3.2" },
  anthropic: { title: "Anthropic", key: "sk-ant-…", model: DEFAULT_ANTHROPIC_MODEL },
};

export function AiSettingsScreen() {
  const accountId = useAccountStore((s) => s.activeAccountId);
  const revision = useSyncExternalStore(subscribeAiConfig, aiConfigRevision);
  const saved = useKeyedLoad(accountId, loadSaved, revision).value;

  return (
    <SettingsScreen title="AI">
      {accountId && saved ? <AiSettingsForm key={accountId} accountId={accountId} saved={saved} /> : null}
    </SettingsScreen>
  );
}

function AiSettingsForm({ accountId, saved }: { accountId: string; saved: Saved }) {
  const enabled = useAppearanceStore((s) => s.aiInChats);
  const [draft, setDraft] = useState<Draft>(saved.draft);
  const [models, setModels] = useState<readonly string[]>([]);
  const change = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const key = draft.key.trim() || null;

  // Switching source starts from an empty form, so a key never follows you to another service.
  const pick = (source: AiSource) => {
    if (source === draft.source) return;
    setModels([]);
    const restored = source === saved.draft.source ? saved.draft : { url: "", model: "", key: "" };
    setDraft({ ...draft, source, url: restored.url, model: restored.model, key: restored.key });
  };

  const dirty =
    draft.source !== saved.draft.source ||
    draft.url.trim() !== saved.draft.url ||
    draft.model.trim() !== saved.draft.model ||
    draft.key.trim() !== saved.draft.key ||
    draft.typesafeKey.trim() !== saved.draft.typesafeKey ||
    JEV_FEATURES.some(({ flag }) => draft[flag] !== saved.draft[flag]);

  const save = useAction(
    async () => {
      if (JEV_FEATURES.some(({ flag }) => draft[flag]) && !draft.typesafeKey.trim()) {
        throw new Error("Enter a TypeSafe API key to enable these chat features.");
      }
      await saveAiKey(accountId, draft.key);
      await saveTypesafeKey(accountId, draft.typesafeKey);
      await saveAiConfig(accountId, draft);
    },
    { success: "Saved the AI settings", failure: "Couldn't save the AI settings" },
  );

  const toggle = useAction((on: boolean) => useAppearanceStore.getState().setAiInChats(on), {
    failure: "Couldn't change the AI setting",
  });

  const tryIt = useAction(
    async () => {
      const model = await providerFor(draft, key);
      const started = Date.now();
      await model.complete({
        instructions: "Reply with the single word OK.",
        prompt: "Are you there?",
        maxAnswerTokens: 20,
      });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      toast.success(`${model.label} answered in ${seconds} s`);
    },
    { failure: "The model didn't answer" },
  );

  const findModels = useAction(
    async () => {
      const found = await listModels(draft.url, key);
      if (found.length === 0) throw new Error("The server lists no models.");
      setModels(found);
    },
    { failure: "Couldn't list the models" },
  );

  const form = draft.source === "auto" ? null : FORM[draft.source];

  return (
    <>
      <View style={{ marginBottom: SECTION_GAP }}>
        <Section>
          <SettingsRow
            testID="ai-enabled"
            label="AI in chats"
            description="Rewrite, Translate, Summarize and Suggest a reply, above the composer and as slash commands"
            icon="sparkles"
            toggle={{ value: enabled, onValueChange: (on) => void toggle.run(on) }}
          />
        </Section>
      </View>

      {enabled ? (
        <>
          <View style={{ marginBottom: SECTION_GAP }}>
            <Section
              label="Jev"
              description="These options send recent messages to TypeSafe, including other participants’ messages. Badges check chats visible in the chat list. Reply suggestions use the model selected below."
            >
              {JEV_FEATURES.map(({ flag, testID, title, subtitle }) => (
                <SettingsRow
                  key={flag}
                  testID={testID}
                  label={title}
                  description={subtitle}
                  toggle={{ value: draft[flag], onValueChange: (on) => change({ [flag]: on }) }}
                />
              ))}
              <Block>
                <Input
                  testID="ai-typesafe-key"
                  label="TypeSafe API key"
                  mono
                  value={draft.typesafeKey}
                  onChangeText={(typesafeKey) => change({ typesafeKey })}
                  placeholder="Your Jev key"
                  autoCorrect={false}
                  autoCapitalize="none"
                  secureTextEntry
                />
                <Button
                  label="Get a TypeSafe key"
                  trailingIcon="arrow-up-right"
                  size="sm"
                  onPress={() => openExternal("https://console.typesafe.ai").catch(() => {})}
                />
              </Block>
            </Section>
          </View>

          <View style={{ marginBottom: SECTION_GAP }}>
            <Section label="Model">
              {SOURCES.map((source) => (
                <Row
                  key={source.id}
                  testID={`ai-source-${source.id}`}
                  title={source.title}
                  preview={source.id === "auto" ? automaticHint(saved.device) : source.hint}
                  leading={<Radio checked={source.id === draft.source} />}
                  onPress={() => pick(source.id)}
                />
              ))}
            </Section>
          </View>

          {form ? (
            <View style={{ marginBottom: SECTION_GAP }}>
              <Section label={form.title}>
                <Block>
                  {draft.source === "openai" ? (
                    <Input
                      testID="ai-url"
                      label="Address"
                      mono
                      value={draft.url}
                      onChangeText={(url) => change({ url })}
                      placeholder={OLLAMA_URL}
                      autoCorrect={false}
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                  ) : null}
                  <Input
                    testID="ai-key"
                    label="API key"
                    mono
                    value={draft.key}
                    onChangeText={(text) => change({ key: text })}
                    placeholder={form.key}
                    autoCorrect={false}
                    autoCapitalize="none"
                    secureTextEntry
                  />
                  <Input
                    testID="ai-model"
                    label="Model"
                    mono
                    value={draft.model}
                    onChangeText={(model) => change({ model })}
                    placeholder={form.model}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {draft.source === "openai" ? (
                    <>
                      {models.length > 0 ? (
                        <View>
                          {models.map((model) => (
                            <Row
                              key={model}
                              title={model}
                              leading={<Radio checked={model === draft.model} />}
                              onPress={() => change({ model })}
                            />
                          ))}
                        </View>
                      ) : null}
                      <Button
                        testID="ai-find-models"
                        icon="search"
                        label="Find models"
                        size="sm"
                        busy={findModels.busy}
                        disabled={!draft.url.trim()}
                        onPress={() => findModels.run()}
                      />
                    </>
                  ) : null}
                </Block>
              </Section>
            </View>
          ) : null}

          <View className="mb-6 flex-row justify-end gap-2 px-4">
            <Button testID="ai-try" label="Try it" busy={tryIt.busy} onPress={() => tryIt.run()} />
            <Button
              testID="ai-save"
              variant="primary"
              label="Save"
              busy={save.busy}
              disabled={!dirty}
              onPress={() => save.run()}
            />
          </View>
        </>
      ) : null}

      <Section label="What leaves this device">
        <Block>
          <Text size="sm" tone="muted">
            AI is off until you turn it on. Commands run when you type them or tap their chips. Enabled Jev features
            also check chats as you view them. Nothing is sent to the chat until you send it yourself.
          </Text>
          <Text size="sm" tone="muted">
            Automatic uses the model built into this device. Enabled Jev features still send recent messages to
            TypeSafe. Translation uses the device&apos;s own translator first, when it has the language.
          </Text>
          <Text size="sm" tone="muted">
            With your server or Anthropic, each request goes to that server: the text you rewrite or translate, and for
            /summarize and /suggest the recent messages of the chat. In a group that includes what other people wrote.
          </Text>
          <Button
            label="How to set this up"
            trailingIcon="arrow-up-right"
            size="sm"
            onPress={() => openExternal(guideUrl("ai")).catch(() => {})}
          />
        </Block>
      </Section>
    </>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return <View className={desktop ? "gap-3 py-3" : "gap-3 p-4"}>{children}</View>;
}

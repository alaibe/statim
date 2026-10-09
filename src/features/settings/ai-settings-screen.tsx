import { useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';

import {
  Button,
  Checkmark,
  Chip,
  Field,
  ListItem,
  Note,
  Section,
  Text,
  toast,
  Toggle,
} from '@/design';
import { readCredentials } from '@/core/account/credentials';
import { useAccountStore } from '@/core/account/account-store';
import {
  aiConfigRevision,
  loadAiConfig,
  saveAiConfig,
  saveAiKey,
  saveTypesafeKey,
  subscribeAiConfig,
  type AiConfig,
  type AiSource,
} from '@/core/ai/config';
import { DEVICE_MODEL_NAME, deviceModelState, type DeviceModelState } from '@/core/ai/device';
import { OLLAMA_URL, providerFor } from '@/core/ai/providers';
import { DEFAULT_ANTHROPIC_MODEL } from '@/core/ai/providers/anthropic';
import { listModels } from '@/core/ai/providers/openai';
import { useAppearanceStore } from '@/core/app/appearance';
import { guideUrl } from '@/lib/guide';
import { openExternal } from '@/lib/open-url';
import { useKeyedLoad } from '@/lib/use-keyed-load';

import { SettingsScreen } from './settings-screen';
import { useAction } from '@/features/use-action';

const DESKTOP = process.env.EXPO_OS === 'web';

const JEV_FEATURES = [
  {
    flag: 'suggestOnOpen',
    testID: 'ai-suggest-on-open',
    title: 'Suggest replies on open',
    subtitle:
      'Jev checks whether you need to reply. Your selected AI writes a suggestion for you to review.',
  },
  {
    flag: 'replyBadges',
    testID: 'ai-reply-badges',
    title: 'Highlight chats needing a reply',
    subtitle: 'Show a Reply needed badge in the chat list.',
  },
  {
    flag: 'followUps',
    testID: 'ai-follow-ups',
    title: 'Suggest follow-ups',
    subtitle:
      'After a day without an answer, show a Follow up badge and suggest a polite nudge when you open the chat.',
  },
  {
    flag: 'suggestActions',
    testID: 'ai-suggest-actions',
    title: 'Suggest useful AI actions',
    subtitle:
      'Highlight Summarize or Translate when it would help with the open chat. The action runs when you tap it.',
  },
] as const;

type JevFlag = (typeof JEV_FEATURES)[number]['flag'];

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
      key: credentials.ai ?? '',
      typesafeKey: credentials.typesafe ?? '',
    },
    device,
  };
}

function automaticHint(device: DeviceModelState): string {
  const ollama = DESKTOP ? ', or Ollama on this computer when it runs' : '';
  switch (device) {
    case 'ready':
      return `${DEVICE_MODEL_NAME} on this device. Nothing you ask leaves it.`;
    case 'off':
      return `${DEVICE_MODEL_NAME}, which is off on this device${ollama}`;
    case 'downloading':
      return `${DEVICE_MODEL_NAME}, still downloading${ollama}`;
    case 'unsupported':
      return DESKTOP
        ? 'Ollama on this computer, when it runs'
        : 'This device has no model of its own';
  }
}

const SOURCES: { id: AiSource; title: string; hint?: string }[] = [
  { id: 'auto', title: 'Automatic' },
  { id: 'openai', title: 'Your server', hint: 'Ollama, llama.cpp, LM Studio, OpenAI, OpenRouter' },
  { id: 'anthropic', title: 'Anthropic', hint: 'Claude, with your API key' },
];

const FORM: Record<Exclude<AiSource, 'auto'>, { title: string; key: string; model: string }> = {
  openai: { title: 'Server', key: 'Only if the server asks for one', model: 'llama3.2' },
  anthropic: { title: 'Anthropic', key: 'sk-ant-…', model: DEFAULT_ANTHROPIC_MODEL },
};

export function AiSettingsScreen() {
  const accountId = useAccountStore((s) => s.activeAccountId);
  const revision = useSyncExternalStore(subscribeAiConfig, aiConfigRevision);
  const saved = useKeyedLoad(accountId, loadSaved, revision).value;

  return (
    <SettingsScreen title="AI">
      {accountId && saved ? (
        <AiSettingsForm key={accountId} accountId={accountId} saved={saved} />
      ) : null}
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
    const restored = source === saved.draft.source ? saved.draft : { url: '', model: '', key: '' };
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
        throw new Error('Enter a TypeSafe API key to enable these chat features.');
      }
      await saveAiKey(accountId, draft.key);
      await saveTypesafeKey(accountId, draft.typesafeKey);
      await saveAiConfig(accountId, draft);
    },
    { success: 'AI settings saved', failure: 'Could not save the AI settings' }
  );

  const toggle = useAction((on: boolean) => useAppearanceStore.getState().setAiInChats(on), {
    failure: 'Could not change the AI setting',
  });

  const tryIt = useAction(
    async () => {
      const model = await providerFor(draft, key);
      const started = Date.now();
      await model.complete({
        instructions: 'Reply with the single word OK.',
        prompt: 'Are you there?',
        maxAnswerTokens: 20,
      });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      toast.success(`${model.label} answered in ${seconds} s`);
    },
    { failure: 'The model did not answer' }
  );

  const findModels = useAction(
    async () => {
      const found = await listModels(draft.url, key);
      if (found.length === 0) throw new Error('The server lists no models.');
      setModels(found);
    },
    { failure: 'Could not list the models' }
  );

  const form = draft.source === 'auto' ? null : FORM[draft.source];

  return (
    <>
      <Section surface="card" className="mb-6">
        <ListItem
          testID="ai-enabled"
          title="AI in chats"
          subtitle="Rewrite, Translate, Summarize and Suggest a reply, above the composer and as slash commands"
          numberOfLinesSubtitle={2}
          trailing={
            <Toggle
              label="AI in chats"
              value={enabled}
              onValueChange={(on) => void toggle.run(on)}
            />
          }
        />
      </Section>

      {enabled ? (
        <>
          <Section title="Jev" surface="card" className="mb-6">
            {JEV_FEATURES.map(({ flag, testID, title, subtitle }) => (
              <ListItem
                key={flag}
                testID={testID}
                title={title}
                subtitle={subtitle}
                numberOfLinesSubtitle={3}
                trailing={
                  <Toggle
                    label={title}
                    value={draft[flag]}
                    onValueChange={(on) => change({ [flag]: on })}
                  />
                }
              />
            ))}
            <View className="gap-3 px-gutter py-4">
              <Field
                testID="ai-typesafe-key"
                label="TypeSafe API key"
                value={draft.typesafeKey}
                onChangeText={(typesafeKey) => change({ typesafeKey })}
                placeholder="Your Jev key"
                autoCorrect={false}
                autoCapitalize="none"
                secureTextEntry
              />
              <Text variant="footnote">
                These options send recent messages to TypeSafe, including other participants’
                messages. Badges check chats visible in the chat list. Reply suggestions use the
                model selected below.
              </Text>
              <Button
                label="Get a TypeSafe key"
                tone="neutral"
                size="sm"
                onPress={() => openExternal('https://console.typesafe.ai').catch(() => {})}
              />
            </View>
          </Section>

          <Section title="Model" surface="card" className="mb-6">
            {SOURCES.map((source) => (
              <ListItem
                key={source.id}
                testID={`ai-source-${source.id}`}
                title={source.title}
                subtitle={source.id === 'auto' ? automaticHint(saved.device) : source.hint}
                numberOfLinesSubtitle={2}
                onPress={() => pick(source.id)}
                trailing={<Checkmark selected={source.id === draft.source} />}
              />
            ))}
          </Section>

          {form ? (
            <Section title={form.title} surface="card" className="mb-6">
              <View className="gap-3 px-gutter py-4">
                {draft.source === 'openai' ? (
                  <Field
                    testID="ai-url"
                    label="Address"
                    value={draft.url}
                    onChangeText={(url) => change({ url })}
                    placeholder={OLLAMA_URL}
                    autoCorrect={false}
                    autoCapitalize="none"
                    keyboardType="url"
                  />
                ) : null}
                <Field
                  testID="ai-key"
                  label="API key"
                  value={draft.key}
                  onChangeText={(text) => change({ key: text })}
                  placeholder={form.key}
                  autoCorrect={false}
                  autoCapitalize="none"
                  secureTextEntry
                />
                <Field
                  testID="ai-model"
                  label="Model"
                  value={draft.model}
                  onChangeText={(model) => change({ model })}
                  placeholder={form.model}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {draft.source === 'openai' ? (
                  <>
                    {models.length > 0 ? (
                      <View className="flex-row flex-wrap gap-1.5">
                        {models.map((model) => (
                          <Chip
                            key={model}
                            label={model}
                            size="sm"
                            selected={model === draft.model}
                            onPress={() => change({ model })}
                          />
                        ))}
                      </View>
                    ) : null}
                    <Button
                      testID="ai-find-models"
                      label="Find models"
                      tone="neutral"
                      size="sm"
                      loading={findModels.busy}
                      disabled={!draft.url.trim() || findModels.busy}
                      onPress={() => findModels.run()}
                    />
                  </>
                ) : null}
              </View>
            </Section>
          ) : null}

          <View className="mb-6 flex-row gap-2 px-gutter">
            <View className="flex-1">
              <Button
                testID="ai-save"
                label="Save"
                fullWidth
                loading={save.busy}
                disabled={!dirty || save.busy}
                onPress={() => save.run()}
              />
            </View>
            <View className="flex-1">
              <Button
                testID="ai-try"
                label="Try it"
                tone="neutral"
                fullWidth
                loading={tryIt.busy}
                disabled={tryIt.busy}
                onPress={() => tryIt.run()}
              />
            </View>
          </View>
        </>
      ) : null}

      <Note className="mx-gutter" icon="information-circle-outline">
        <Text variant="footnote">
          AI is off until you turn it on. Commands run when you type them or tap their chips.
          Enabled Jev features also check chats as you view them. Nothing is sent to the chat until
          you send it yourself.
        </Text>
        <Text variant="footnote">
          Automatic uses the model built into this device. Enabled Jev features still send recent
          messages to TypeSafe. Translation uses the device&apos;s own translator first, when it has
          the language.
        </Text>
        <Text variant="footnote">
          With your server or Anthropic, each request goes to that server: the text you rewrite or
          translate, and for /summarize and /suggest the recent messages of the chat. In a group
          that includes what other people wrote.
        </Text>
        <Button
          label="How to set this up"
          tone="neutral"
          onPress={() => openExternal(guideUrl('ai')).catch(() => {})}
        />
      </Note>
    </>
  );
}

import { useState } from 'react';
import { View } from 'react-native';

import { Button, Checkmark, Chip, Field, ListItem, Note, Section, Text, toast } from '@/design';
import { useAccountStore } from '@/core/account/account-store';
import { DEFAULT_ANTHROPIC_MODEL } from '@/core/ai/providers/anthropic';
import {
  loadAiConfig,
  loadAiKey,
  saveAiConfig,
  saveAiKey,
  type AiConfig,
  type AiSource,
} from '@/core/ai/config';
import { DEVICE_MODEL_NAME, deviceModelState, type DeviceModelState } from '@/core/ai/device';
import { OLLAMA_URL, providerFor } from '@/core/ai/providers';
import { apiRoot, listModels } from '@/core/ai/providers/openai';
import { hostOf } from '@/core/ai/providers/remote';
import { useKeyedLoad } from '@/lib/use-keyed-load';

import { SettingsScreen } from './settings-screen';
import { useAction } from '@/features/use-action';

const DESKTOP = process.env.EXPO_OS === 'web';

interface Saved {
  config: AiConfig;
  key: string;
  device: DeviceModelState;
}

interface Draft extends AiConfig {
  key: string;
}

async function loadSaved(accountId: string): Promise<Saved> {
  const [config, key, device] = await Promise.all([
    loadAiConfig(accountId),
    loadAiKey(accountId),
    deviceModelState(),
  ]);
  return { config, key: key ?? '', device };
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

/** Phones refuse plain http:// to most servers; say so before the request fails. */
function addressHint(url: string): string | undefined {
  if (!/^http:\/\//i.test(url.trim())) return undefined;
  const host = hostOf(apiRoot(url)).replace(/:\d+$/, '');
  if (process.env.EXPO_OS === 'ios' && host.includes('.') && !host.endsWith('.local')) {
    return 'On iPhone, http:// only reaches names on your network, like mac-mini.local or a Tailscale machine name. Use https:// for any other address.';
  }
  if (process.env.EXPO_OS === 'android' && host !== 'localhost') {
    return 'Android connects only to https:// servers.';
  }
  return undefined;
}

const SOURCES: { id: AiSource; title: string; hint?: string }[] = [
  { id: 'auto', title: 'Automatic' },
  { id: 'openai', title: 'Your server', hint: 'Ollama, llama.cpp, LM Studio, OpenAI, OpenRouter' },
  { id: 'anthropic', title: 'Anthropic', hint: 'Claude, with your API key' },
];

export function AiSettingsScreen() {
  const accountId = useAccountStore((s) => s.activeAccountId);
  const [version, setVersion] = useState(0);
  const saved = useKeyedLoad(accountId, loadSaved, version).value;

  return (
    <SettingsScreen title="AI">
      {accountId && saved ? (
        <AiSettingsForm
          key={accountId}
          accountId={accountId}
          saved={saved}
          onSaved={() => setVersion((v) => v + 1)}
        />
      ) : null}
    </SettingsScreen>
  );
}

function AiSettingsForm({
  accountId,
  saved,
  onSaved,
}: {
  accountId: string;
  saved: Saved;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({ ...saved.config, key: saved.key });
  const [models, setModels] = useState<readonly string[]>([]);
  const change = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  // A key belongs to the source it was saved with, so another server never receives it.
  const pick = (source: AiSource) => {
    if (source === draft.source) return;
    const same = source === saved.config.source;
    setModels([]);
    setDraft({
      source,
      url: same ? saved.config.url : '',
      model: same ? saved.config.model : '',
      key: same ? saved.key : '',
    });
  };

  const dirty =
    draft.source !== saved.config.source ||
    draft.url.trim() !== saved.config.url ||
    draft.model.trim() !== saved.config.model ||
    draft.key.trim() !== saved.key;

  const save = useAction(
    async () => {
      await saveAiConfig(accountId, draft);
      await saveAiKey(accountId, draft.key);
      onSaved();
    },
    { success: 'AI settings saved', failure: 'Could not save the AI settings' }
  );

  const tryIt = useAction(
    async () => {
      const lookup = await providerFor(draft, draft.key.trim() || null);
      if (!lookup.ok) throw new Error(lookup.reason);
      const started = Date.now();
      await lookup.provider.complete({
        instructions: 'Reply with the single word OK.',
        prompt: 'Are you there?',
      });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      toast.success(`${lookup.provider.label} answered in ${seconds} s`);
    },
    { failure: 'The model did not answer' }
  );

  const findModels = useAction(
    async () => {
      const found = await listModels(draft.url, draft.key.trim() || null);
      if (found.length === 0) throw new Error('The server lists no models.');
      setModels(found);
    },
    { failure: 'Could not list the models' }
  );

  return (
    <>
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

      {draft.source === 'openai' ? (
        <Section title="Server" surface="card" className="mb-6">
          <View className="gap-3 px-gutter py-4">
            <Field
              testID="ai-url"
              label="Address"
              value={draft.url}
              onChangeText={(url) => change({ url })}
              placeholder={OLLAMA_URL}
              hint={addressHint(draft.url)}
              autoCorrect={false}
              autoCapitalize="none"
              keyboardType="url"
            />
            <Field
              testID="ai-key"
              label="API key"
              value={draft.key}
              onChangeText={(key) => change({ key })}
              placeholder="Only if the server asks for one"
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry
            />
            <Field
              testID="ai-model"
              label="Model"
              value={draft.model}
              onChangeText={(model) => change({ model })}
              placeholder="llama3.2"
              autoCorrect={false}
              autoCapitalize="none"
            />
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
          </View>
        </Section>
      ) : null}

      {draft.source === 'anthropic' ? (
        <Section title="Anthropic" surface="card" className="mb-6">
          <View className="gap-3 px-gutter py-4">
            <Field
              testID="ai-key"
              label="API key"
              value={draft.key}
              onChangeText={(key) => change({ key })}
              placeholder="sk-ant-…"
              autoCorrect={false}
              autoCapitalize="none"
              secureTextEntry
            />
            <Field
              testID="ai-model"
              label="Model"
              value={draft.model}
              onChangeText={(model) => change({ model })}
              placeholder={DEFAULT_ANTHROPIC_MODEL}
              autoCorrect={false}
              autoCapitalize="none"
            />
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

      <Note className="mx-gutter" icon="information-circle-outline">
        <Text variant="footnote">
          Turn on the AI plugin in Settings › Plugins to add /rewrite, /translate, /summarize and
          /suggest to your chats. Each runs only when you type it, and nothing is sent until you
          send it yourself.
        </Text>
        <Text variant="footnote">
          Automatic uses the model built into this device, so the text never leaves it. Translation
          uses the device&apos;s own translator first, when it has the language.
        </Text>
        <Text variant="footnote">
          With your server or Anthropic, each request goes to that server: the text you rewrite or
          translate, and for /summarize and /suggest the recent messages of the chat. In a group
          that includes what other people wrote.
        </Text>
      </Note>
    </>
  );
}

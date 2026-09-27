import { useState } from 'react';

import { ConfirmSheet, ListItem, Section, toast, Toggle } from '@/design';
import { useChatStore } from '@/core/messaging/chat-store';
import { botChatLoss, botChatLossCopy, type BotChatLoss } from '@/core/plugins/bot-chats';
import { usePluginHost } from '@/core/plugins/host';
import { type Plugin } from '@/core/plugins/types';
import { errorMessage } from '@/core/errors';
import { PluginDetailSheet, PluginIcon } from '@/features/settings/plugin-detail-sheet';
import { SettingsScreen } from '@/features/settings/settings-screen';

export default function PluginsScreen() {
  const { registry, enabledIds, setEnabled } = usePluginHost();

  const [detail, setDetail] = useState<Plugin | null>(null);

  const [pendingDisable, setPendingDisable] = useState<{
    plugin: Plugin;
    loss: BotChatLoss;
  } | null>(null);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  const apply = async (plugin: Plugin, next: boolean) => {
    const id = plugin.manifest.id;
    const done = `${plugin.manifest.name} ${next ? 'enabled' : 'disabled'}`;
    setToggling((current) => ({ ...current, [id]: next }));
    try {
      await setEnabled(id, next);
      toast.success(done);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not update plugin'));
    } finally {
      setToggling(({ [id]: _settled, ...rest }) => rest);
    }
  };

  const onToggle = async (plugin: Plugin, next: boolean) => {
    if (next) return apply(plugin, true);

    const loss = botChatLoss(registry.botsOf(plugin.manifest.id), useChatStore.getState().messages);
    if (!loss) return apply(plugin, false);

    setPendingDisable({ plugin, loss });
  };

  const copy = pendingDisable
    ? botChatLossCopy(pendingDisable.plugin.manifest.name, pendingDisable.loss)
    : null;

  return (
    <SettingsScreen
      title="Plugins"
      intro="Plugins add commands, message types and screens. They ship inside the app, so enabling one grants it the access its row lists.">
      <Section surface="card" className="mb-6">
        {registry.list().map((plugin) => {
          const enabled = toggling[plugin.manifest.id] ?? enabledIds.includes(plugin.manifest.id);
          return (
            <ListItem
              key={plugin.manifest.id}
              testID={`plugin-${plugin.manifest.id}`}
              title={plugin.manifest.name}
              subtitle={plugin.manifest.description}
              numberOfLinesSubtitle={2}
              leading={<PluginIcon plugin={plugin} />}
              trailing={
                <Toggle
                  label={plugin.manifest.name}
                  value={enabled}
                  onValueChange={(next) => onToggle(plugin, next)}
                />
              }
              onPress={() => setDetail(plugin)}
            />
          );
        })}
      </Section>

      <PluginDetailSheet plugin={detail} onClose={() => setDetail(null)} />

      <ConfirmSheet
        visible={pendingDisable !== null}
        onClose={() => setPendingDisable(null)}
        title={copy?.title}
        body={copy?.body}
        cancelLabel="Keep it on"
        confirm={{
          label: copy?.confirmLabel ?? 'Turn off',
          tone: 'danger',
          onPress: () => {
            if (!pendingDisable) return;
            setPendingDisable(null);
            void apply(pendingDisable.plugin, false);
          },
        }}
      />
    </SettingsScreen>
  );
}

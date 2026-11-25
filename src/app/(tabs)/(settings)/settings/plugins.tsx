import { useState } from "react";
import { errorMessage } from "@/core/errors";
import { useChatStore } from "@/core/messaging/chat-store";
import { type BotChatLoss, botChatLoss, botChatLossCopy } from "@/core/plugins/bot-chats";
import { usePluginHost } from "@/core/plugins/host";
import { type Plugin } from "@/core/plugins/types";
import { ConfirmDialog, Row, Section, Toggle, toast } from "@/design";
import { PluginDetailSheet, PluginIcon } from "@/features/settings/plugin-detail-sheet";
import { SettingsScreen } from "@/features/settings/settings-screen";

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
    const done = `${next ? "Enabled" : "Disabled"} ${plugin.manifest.name}`;
    setToggling((current) => ({ ...current, [id]: next }));
    try {
      await setEnabled(id, next);
      toast.success(done);
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't update the plugin"));
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

  return (
    <SettingsScreen
      title="Plugins"
      intro="Plugins add slash commands, message types and screens. They ship inside the app, so enabling one grants it the access its row lists."
    >
      <Section label="Installed">
        {registry.list().map((plugin) => {
          const enabled = toggling[plugin.manifest.id] ?? enabledIds.includes(plugin.manifest.id);
          return (
            <Row
              key={plugin.manifest.id}
              testID={`plugin-${plugin.manifest.id}`}
              title={plugin.manifest.name}
              preview={plugin.manifest.description}
              leading={<PluginIcon plugin={plugin} />}
              trailing={
                <Toggle
                  label={plugin.manifest.name}
                  value={enabled}
                  onValueChange={(next) => void onToggle(plugin, next)}
                />
              }
              onPress={() => setDetail(plugin)}
            />
          );
        })}
      </Section>

      {detail ? <PluginDetailSheet plugin={detail} onClose={() => setDetail(null)} /> : null}

      {pendingDisable ? (
        <ConfirmDisable
          {...pendingDisable}
          onClose={() => setPendingDisable(null)}
          onConfirm={() => {
            setPendingDisable(null);
            void apply(pendingDisable.plugin, false);
          }}
        />
      ) : null}
    </SettingsScreen>
  );
}

function ConfirmDisable({
  plugin,
  loss,
  onClose,
  onConfirm,
}: {
  plugin: Plugin;
  loss: BotChatLoss;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const copy = botChatLossCopy(plugin.manifest.name, loss);
  return (
    <ConfirmDialog
      visible
      onClose={onClose}
      title={copy.title}
      body={copy.body}
      cancelLabel="Keep it on"
      confirm={{ label: copy.confirmLabel, danger: true, onPress: onConfirm }}
    />
  );
}

import { Fragment } from "react";
import { View } from "react-native";
import { usePluginHost } from "@/core/plugins/host";
import { PERMISSION_LABELS, type Plugin } from "@/core/plugins/types";
import { Avatar, Divider, Sheet, Tag, Text } from "@/design";

/** A plugin is an agent, so its avatar is the square with its mark. */
export function PluginIcon({ plugin, size = 40 }: { plugin: Plugin; size?: 28 | 40 }) {
  return <Avatar shape="square" size={size} icon={plugin.manifest.icon} label={plugin.manifest.name} />;
}

export function PluginDetailSheet({ plugin, onClose }: { plugin: Plugin; onClose: () => void }) {
  const { registry } = usePluginHost();
  const { manifest } = plugin;
  const hasChat = registry.botsOf(manifest.id).length > 0;

  return (
    <Sheet
      visible
      onClose={onClose}
      title={manifest.name}
      subtitle={`v${manifest.version}`}
      leading={<PluginIcon plugin={plugin} />}
    >
      <View className="gap-4">
        <Text tone="muted">{manifest.description}</Text>

        <View className="gap-2">
          <Text variant="label">What it can reach</Text>
          <View>
            {manifest.permissions.map((permission) => (
              <Fragment key={permission}>
                <Divider />
                <View className="py-3">
                  <Text size="sm">{PERMISSION_LABELS[permission]}</Text>
                </View>
              </Fragment>
            ))}
            <Divider />
          </View>
        </View>

        {manifest.requiresSessionRestart || hasChat ? (
          <View className="flex-row flex-wrap gap-2">
            {manifest.requiresSessionRestart ? <Tag tone="warn" label="Reconnects chat" /> : null}
            {hasChat ? <Tag tone="accent" label="Own chat" /> : null}
          </View>
        ) : null}

        {hasChat ? (
          <Text size="sm" tone="muted">
            Turning this off takes its chat out of your list. The transcript stays on this device and returns if you
            turn it back on.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

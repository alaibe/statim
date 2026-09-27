import { View } from 'react-native';

import { Badge, cn, RowIcon, type RowIconTone, Section, Sheet, Text } from '@/design';
import { usePluginHost } from '@/core/plugins/host';
import { PERMISSION_LABELS, type Plugin } from '@/core/plugins/types';

const TONE: Record<string, RowIconTone> = {
  assistant: 'purple',
  profile: 'blue',
  bots: 'grey',
  wallet: 'green',
  browser: 'teal',
  markets: 'orange',
};

export function PluginIcon({ plugin }: { plugin: Plugin }) {
  return <RowIcon name={plugin.manifest.icon} tone={TONE[plugin.manifest.id] ?? 'grey'} />;
}

export function PluginDetailSheet({
  plugin,
  onClose,
}: {
  plugin: Plugin | null;
  onClose: () => void;
}) {
  const { registry } = usePluginHost();
  const hasChat = plugin ? registry.botsOf(plugin.manifest.id).length > 0 : false;

  return (
    <Sheet
      visible={plugin !== null}
      onClose={onClose}
      title={plugin?.manifest.name}
      subtitle={plugin ? `v${plugin.manifest.version}` : undefined}
      leading={plugin ? <PluginIcon plugin={plugin} /> : undefined}>
      <View className="gap-3">
        <Text variant="footnote">{plugin?.manifest.description}</Text>

        <Section title="What it can reach" surface="card" inset={false}>
          {plugin?.manifest.permissions.map((permission, i) => (
            <Text
              key={permission}
              variant="footnote"
              className={cn('px-4 py-2.5', i > 0 && 'border-t border-line')}>
              {PERMISSION_LABELS[permission]}
            </Text>
          ))}
        </Section>

        {plugin?.manifest.requiresSessionRestart || hasChat ? (
          <View className="flex-row flex-wrap gap-1.5">
            {plugin?.manifest.requiresSessionRestart ? (
              <Badge label="Reconnects chat" tone="warning" />
            ) : null}
            {hasChat ? <Badge label="Has its own chat" tone="brand" /> : null}
          </View>
        ) : null}

        {hasChat ? (
          <Text variant="caption">
            Turning this off takes its chat out of your list. The transcript stays on this device
            and returns if you turn it back on.
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import type { ChatId } from '@/core/messaging/types';
import { usePluginHost } from '@/core/plugins/host';
import type { Widget } from '@/design/widgets';
import { WidgetView } from '@/design/widgets/widget-view';

import { openUrlQuietly } from './link-actions';
import { useOffersSend } from './use-offers-send';

/** The wallet's card for an address or name; nothing when the wallet is off. */
export function AddressPreview({
  value,
  chatId,
  onCommand,
}: {
  value: string;
  chatId: ChatId;
  onCommand?: (command: string) => void;
}) {
  const { registry, enabledIds } = usePluginHost();
  const [built, setBuilt] = useState<{ value: string; widget: Widget } | null>(null);
  const canSend = useOffersSend(chatId, onCommand);

  useEffect(() => {
    const view = registry.view('wallet', 'address');
    if (!view) return;
    let stale = false;
    view(canSend ? [value] : [value, 'no-send'])
      .then((content) => {
        if (!stale) setBuilt({ value, widget: content.widget });
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [registry, enabledIds, value, canSend]);

  if (!built || built.value !== value) return null;

  return (
    <View className="mt-1.5">
      <WidgetView widget={built.widget} onCommand={onCommand} onOpenUrl={openUrlQuietly} />
    </View>
  );
}

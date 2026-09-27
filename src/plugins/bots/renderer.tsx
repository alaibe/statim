import { View } from 'react-native';

import { Badge } from '@/design';
import type { MessageRendererProps } from '@/core/plugins/types';
import { WidgetView } from '@/design/widgets/widget-view';

import type { UiMessage } from './types';

export function BotWidgetMessage({ data, fromMe, onCommand }: MessageRendererProps<UiMessage>) {
  return (
    <View className="w-[280px] gap-1.5">
      <WidgetView widget={data.widget} onCommand={onCommand} />
      {!fromMe ? (
        <View className="flex-row">
          <Badge label="From a bot" />
        </View>
      ) : null}
    </View>
  );
}

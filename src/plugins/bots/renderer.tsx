import { View } from "react-native";
import type { MessageRendererProps } from "@/core/plugins/types";
import { Tag } from "@/design";
import { WidgetView } from "@/design/widgets/widget-view";

import type { UiMessage } from "./types";

export function BotWidgetMessage({ data, fromMe, onCommand }: MessageRendererProps<UiMessage>) {
  return (
    <View className="w-72 gap-2">
      <WidgetView widget={data.widget} onCommand={onCommand} />
      {!fromMe ? (
        <View className="flex-row">
          <Tag label="Bot" />
        </View>
      ) : null}
    </View>
  );
}

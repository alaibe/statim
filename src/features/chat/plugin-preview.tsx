import { View } from "react-native";

import type { LiveView } from "@/core/messaging/types";
import { WidgetView } from "@/design/widgets/widget-view";

import { openUrlQuietly } from "./link-actions";
import { usePluginView } from "./use-live-widget";

export function PluginPreview({
  live,
  once,
  onCommand,
}: {
  live: LiveView;
  once?: boolean;
  onCommand?: (command: string) => void;
}) {
  const widget = usePluginView(live, { once });
  if (!widget) return null;

  return (
    <View className="mt-1.5">
      <WidgetView widget={widget} onCommand={onCommand} onOpenUrl={openUrlQuietly} />
    </View>
  );
}

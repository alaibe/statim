import { useEffect, useState } from 'react';

import type { LiveView, WidgetContent } from '@/core/messaging/types';
import { usePluginHost } from '@/core/plugins/host';
import { useLiveViews } from '@/core/plugins/live';
import type { Widget } from '@/design/widgets';

export function useLiveWidget(content: WidgetContent): Widget {
  return usePluginView(content.live) ?? content.widget;
}

/** The view's widget, rebuilt whenever its plugin writes unless `once`; null until it is built. */
export function usePluginView(
  live: LiveView | null | undefined,
  { once = false } = {}
): Widget | null {
  const { registry, enabledIds } = usePluginHost();
  const key = live ? JSON.stringify(live) : null;
  const version = useLiveViews((s) => (live && !once ? (s.versions[live.pluginId] ?? 0) : 0));
  const [built, setBuilt] = useState<{ key: string; widget: Widget } | null>(null);

  useEffect(() => {
    if (!key) return;
    const { pluginId, view: name, args } = JSON.parse(key) as LiveView;
    const view = registry.view(pluginId, name);
    if (!view) return;

    let stale = false;
    view(args)
      .then((content) => {
        if (!stale) setBuilt({ key, widget: content.widget });
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [registry, enabledIds, key, version]);

  return built && built.key === key ? built.widget : null;
}

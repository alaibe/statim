import type { PluginContext } from '@/core/plugins/types';
import { isWidget, type Widget } from '@/design/widgets';
import { isString, shape } from '@/lib/guards';

export interface KnownBot {
  address: string;
  name: string;
  description?: string;
  participantId?: string;
  addedAt: number;
}

export const CONTENT_TYPE_UI = 'ui.widget';

export interface UiMessage {
  widget: Widget;
  fallback: string;
}

export const isUiMessage = shape<UiMessage>({ widget: isWidget, fallback: isString });

const STORAGE_BOTS = 'known-bots';

export async function readBots(context: PluginContext): Promise<KnownBot[]> {
  return (await context.storage.get<KnownBot[]>(STORAGE_BOTS)) ?? [];
}

export async function writeBots(context: PluginContext, bots: KnownBot[]): Promise<void> {
  await context.storage.set(STORAGE_BOTS, bots);
}

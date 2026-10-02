import type { Plugin, PluginId } from '@/core/plugins/types';

import { aiPlugin } from './ai';
import { assistantPlugin } from './assistant';
import { botsPlugin } from './bots';
import { browserPlugin } from './browser';
import { marketsPlugin } from './markets';
import { walletPlugin } from './wallet';
import { profilePlugin } from './profile';

export const ALL_PLUGINS: Plugin[] = [
  assistantPlugin,
  profilePlugin,
  botsPlugin,
  walletPlugin,
  browserPlugin,
  marketsPlugin,
  aiPlugin,
];

export const DEFAULT_ENABLED_PLUGINS: PluginId[] = [
  assistantPlugin.manifest.id,
  profilePlugin.manifest.id,
];

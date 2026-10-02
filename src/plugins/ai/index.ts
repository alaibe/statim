import type { Plugin } from '@/core/plugins/types';

import { aiCommands } from './commands';

export const aiPlugin: Plugin = {
  manifest: {
    id: 'ai',
    name: 'AI',
    description:
      'Rewrite and translate your messages, summarise a chat or get reply ideas, with the model on this device or one you set up.',
    version: '1.0.0',
    icon: 'sparkles-outline',
    permissions: ['chat.read', 'network'],
  },

  setup(context) {
    return { commands: aiCommands(context) };
  },
};

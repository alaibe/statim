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
    return {
      commands: aiCommands(context),
      composerActions: [
        {
          id: 'ai-rewrite',
          label: 'Rewrite',
          icon: 'create-outline',
          command: '/rewrite',
          takesDraft: true,
          showIn: ['dm', 'group'],
        },
        {
          id: 'ai-translate',
          label: 'Translate',
          icon: 'globe-outline',
          command: '/translate',
          showIn: ['dm', 'group', 'channel'],
        },
        {
          id: 'ai-summarize',
          label: 'Summarize',
          icon: 'document-text-outline',
          command: '/summarize',
          showIn: ['dm', 'group', 'channel'],
        },
        {
          id: 'ai-suggest',
          label: 'Suggest a reply',
          icon: 'chatbubbles-outline',
          command: '/suggest',
          showIn: ['dm', 'group'],
        },
      ],
    };
  },
};

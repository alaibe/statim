import { liveViews } from '@/core/plugins/live';
import type { Plugin, PluginContext } from '@/core/plugins/types';

import { addressCard } from './address-card';
import { makeWalletBot } from './bot';
import { walletCommands } from './commands';
import { walletContentTypes } from './content-types';
import {
  disposeStrategies,
  enabledChains,
  walletChainById,
  chainsCard,
  chainsCommand,
  pickEvm,
  syncStrategies,
} from './chain-list';
import { channelCommands, endpointCard } from './channel-commands';
import { tokensCommand } from './tokens';
import { tradeCommand } from './trade';
import { watchCommands, watchedCard } from './chains/watch-commands';
import { hydrateRpcOverrides } from './chains/rpc';

export const walletPlugin: Plugin = {
  manifest: {
    id: 'wallet',
    name: 'Wallet',
    description: 'Balances, sends, trades and payment requests, on the chains you switch on.',
    version: '2.0.0',
    icon: 'wallet-outline',
    permissions: [
      'account.read',
      'account.sign',
      'chat.read',
      'chat.send',
      'browser.open',
      'network',
      'storage',
    ],
    requiresSessionRestart: true,
  },

  setup(context: PluginContext) {
    const views = liveViews(context, {
      address: ([value, mode]) => addressCard(context, value, { offerSend: mode !== 'no-send' }),
      chains: () => chainsCard(context),
      endpoint: ([id]) => {
        const chain = walletChainById(id);
        if (!chain) throw new Error(`No chain called "${id}".`);
        return endpointCard(context, chain);
      },
      watched: ([id]) => {
        const chain = walletChainById(id)?.evm;
        if (!chain) throw new Error(`No EVM chain called "${id}".`);
        return watchedCard(context, chain, id);
      },
    });

    return {
      bots: [makeWalletBot(context)],
      contentTypes: walletContentTypes,
      views,

      commands: [
        ...walletCommands,
        tradeCommand,
        tokensCommand,
        ...channelCommands(context, views),
        ...watchCommands((args) => pickEvm(context, args), views),
        chainsCommand(context, views),
      ],

      composerActions: [
        {
          id: 'request',
          label: 'Request',
          icon: 'arrow-down-circle-outline',
          command: '/request',
          showIn: ['dm', 'group'],
        },
        {
          id: 'send',
          label: 'Send',
          icon: 'arrow-up-circle-outline',
          command: '/send',
          showIn: ['dm', 'group'],
        },
        {
          id: 'balance',
          label: 'Balance',
          icon: 'wallet-outline',
          command: '/balance',
          showIn: ['channel'],
        },
        {
          id: 'channel-send',
          label: 'Send',
          icon: 'arrow-up-circle-outline',
          command: '/send',
          showIn: ['channel'],
        },
        {
          id: 'trade',
          label: 'Trade',
          icon: 'swap-horizontal-outline',
          command: '/trade',
          showIn: ['channel'],
        },
        {
          id: 'chains',
          label: 'Chains',
          icon: 'git-network-outline',
          command: '/chains',
          showIn: ['channel'],
        },
      ],

      async start() {
        await hydrateRpcOverrides(context);
        await syncStrategies(context);
        return disposeStrategies;
      },
    };
  },
};

export { enabledChains };

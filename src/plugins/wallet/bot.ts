import { poll, type Bot, type PluginContext } from '@/core/plugins/types';
import { W } from '@/design/widgets';

import { enabledChains, CHAINS } from './chain-list';

export const WALLET_BOT_ID = 'wallet';

const POLL_MS = 120_000;

export function makeWalletBot(context: PluginContext): Bot {
  return {
    id: WALLET_BOT_ID,
    name: 'Wallet',
    tagline: 'Balances, sends and chains',
    emoji: '👛',

    greeting: () => [
      'This is where your money lives. Every chain you switch on reports here: a balance moving, a payment landing in the mempool and then confirming. Slash commands act on the chain you have selected, and take --chain when you mean another one.',
      {
        kind: 'widget',
        fallback: '/balance /send /chains',
        widget: W.card(
          [
            W.list([
              {
                title: '/balance',
                subtitle: 'What you hold, across every chain that is on',
                actions: [{ label: 'Show me', command: '/balance' }],
              },
              {
                title: '/send',
                subtitle: 'Move some, with a review step before anything is signed',
                actions: [{ label: 'Start one', command: '/send' }],
              },
              {
                title: '/trade',
                subtitle: 'Swap a token or bridge it to another chain, through LI.FI',
                actions: [{ label: 'Start one', command: '/trade' }],
              },
              {
                title: '/tokens',
                subtitle: 'What a chain is watched for, and adding one it misses',
                actions: [{ label: 'Show me', command: '/tokens' }],
              },
              {
                title: '/gas',
                subtitle: 'What a transaction costs on a chain right now',
                actions: [{ label: 'Check', command: '/gas' }],
              },
              {
                title: '/chains',
                subtitle: `Switch chains on and off (${CHAINS.length} available)`,
                actions: [{ label: 'Chains', command: '/chains' }],
              },
              {
                title: '/watch',
                subtitle: 'Track an address and hear about it here',
                actions: [{ label: 'Watch one', command: '/draft /watch ' }],
              },
            ]),
            W.text(
              'Asking someone for money and splitting a bill live in the chat with ' +
                'them: /request and /split only make sense where there is somebody to ask.'
            ),
          ],
          { title: 'Wallet', icon: 'wallet-outline' }
        ),
      },
    ],

    activate: poll(POLL_MS, async (ctx) => {
      for (const chain of await enabledChains(context)) {
        if (!chain.poll) continue;
        try {
          await chain.poll(context, (content) => ctx.say(content));
        } catch (error) {
          console.warn(`[wallet] ${chain.id} poll failed`, error);
        }
      }
    }),

    async onMessage(text, ctx) {
      const asked =
        /\b(balance|how much|hold|send|pay|swap|bridge|trade|token|gas|fee|explorer|rpc|node|watch)\b/i.test(
          text
        );
      await ctx.say(
        asked
          ? 'Try /balance, /send, /trade, /tokens, /gas, /watch, /explorer or /rpc. Add --chain to mean a different chain.'
          : 'This chat is money: /balance to start, /chains to choose which chains, or / to see the rest.'
      );
    },
  };
}

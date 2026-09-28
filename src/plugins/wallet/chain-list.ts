import type { Chain } from 'viem';

import { flagValue, withoutFlag } from '@/core/commands/flags';
import { errorMessage } from '@/core/errors';
import type { PluginContext, PluginView, SlashCommand } from '@/core/plugins/types';
import type { IconName } from '@/design';
import { W } from '@/design/widgets';

import { checkAddress as bitcoinPoll } from './bitcoin/bot';
import { bitcoinStrategy } from './bitcoin';
import { hydrateApiBase } from './bitcoin/config';
import { EVM_CHAINS, evmStrategy } from './chains/evm';
import { hydrateRpcOverrides } from './chains/rpc';
import {
  registerChainStrategy,
  sendableChains,
  type ChainId,
  type ChainStrategy,
  type Say,
} from './chains/strategy';
import { checkBalances } from './chains/watcher';
import { solanaStrategy } from './solana';
import { hydrateRpcUrl as hydrateSolanaRpc } from './solana/rpc';

export interface WalletChain {
  id: ChainId;
  name: string;
  icon: IconName;
  description: string;
  evm?: Chain;
  /** A test chain: its coin comes from a faucet and is worth nothing. */
  testnet?: boolean;
  strategy(context: PluginContext): ChainStrategy;
  poll?(context: PluginContext, say: Say): Promise<void>;
  hydrate?(context: PluginContext): Promise<void>;
}

export const CHAINS: WalletChain[] = [
  ...EVM_CHAINS.map(
    (spec): WalletChain => ({
      id: spec.id,
      name: spec.name,
      icon: spec.icon,
      description: spec.description,
      evm: spec.chain,
      testnet: spec.testnet,
      strategy: () => evmStrategy(spec),
      poll: (context, say) => checkBalances(spec, context, say),
    })
  ),
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    icon: 'logo-bitcoin',
    description: 'A native SegWit address from your recovery phrase.',
    strategy: bitcoinStrategy,
    poll: bitcoinPoll,
    hydrate: hydrateApiBase,
  },
  {
    id: 'solana',
    name: 'Solana',
    icon: 'sunny-outline',
    description: 'An ed25519 address from the same recovery phrase.',
    strategy: () => solanaStrategy,
    hydrate: hydrateSolanaRpc,
  },
];

export function walletChainById(id: string | undefined): WalletChain | undefined {
  if (!id) return undefined;
  const wanted = id.toLowerCase();
  return CHAINS.find((n) => n.id === wanted || n.name.toLowerCase() === wanted);
}

const STORAGE_ENABLED = 'chains';
const STORAGE_ACTIVE = 'active-chain';

const DEFAULT_ENABLED: ChainId[] = ['ethereum'];

export async function enabledIds(context: PluginContext): Promise<ChainId[]> {
  return (await context.storage.get<ChainId[]>(STORAGE_ENABLED)) ?? DEFAULT_ENABLED;
}

const chainsOf = (ids: ChainId[]) => CHAINS.filter((n) => ids.includes(n.id));

export async function enabledChains(context: PluginContext): Promise<WalletChain[]> {
  return chainsOf(await enabledIds(context));
}

/** Pass `enabled` when the caller has already read the enabled ids. */
export async function activeChain(
  context: PluginContext,
  enabled?: ChainId[]
): Promise<WalletChain | null> {
  const [ids, saved] = await Promise.all([
    enabled ?? enabledIds(context),
    context.storage.get<string>(STORAGE_ACTIVE),
  ]);
  const on = chainsOf(ids);
  if (on.length === 0) return null;
  return on.find((n) => n.id === saved) ?? on[0];
}

const registered = new Map<ChainId, () => void>();

export async function syncStrategies(context: PluginContext, enabled?: ChainId[]): Promise<void> {
  const wanted = chainsOf(enabled ?? (await enabledIds(context)));
  const wantedIds = new Set(wanted.map((n) => n.id));

  for (const [id, dispose] of registered) {
    if (!wantedIds.has(id)) {
      dispose();
      registered.delete(id);
    }
  }

  for (const chain of wanted) {
    if (registered.has(chain.id)) continue;
    await chain.hydrate?.(context);
    registered.set(chain.id, registerChainStrategy(chain.strategy(context)));
  }
}

export function disposeStrategies(): void {
  for (const dispose of registered.values()) dispose();
  registered.clear();
}

export async function setEnabled(
  context: PluginContext,
  id: ChainId,
  on: boolean,
  enabled?: ChainId[]
): Promise<void> {
  const current = enabled ?? (await enabledIds(context));
  const ids = new Set(current);
  const active = await activeChain(context, current);
  if (!on && active?.id === id) {
    throw new Error(
      `${active.name} is the default. Choose another enabled chain with /chains <id> default before turning it off.`
    );
  }
  if (on) {
    await context.storage.set(STORAGE_ACTIVE, active?.id ?? id);
    ids.add(id);
  } else {
    ids.delete(id);
  }
  await context.storage.set(STORAGE_ENABLED, [...ids]);
  if (on) await hydrateRpcOverrides(context);
  await syncStrategies(context, [...ids]);
}

export async function setActive(
  context: PluginContext,
  id: ChainId,
  enabled?: ChainId[]
): Promise<void> {
  const on = chainsOf(enabled ?? (await enabledIds(context)));
  if (!on.some((chain) => chain.id === id)) {
    throw new Error(`Turn the chain on with /chains ${id} on before making it the default.`);
  }
  await context.storage.set(STORAGE_ACTIVE, id);
}

const CHAIN_ALIASES = ['-c'];

export const chainFlag = (args: string[]) => flagValue(args, '--chain', CHAIN_ALIASES);
export const withoutChain = (args: string[]) => withoutFlag(args, '--chain', CHAIN_ALIASES);

export const NO_CHAIN_ON = 'No chain is switched on. /chains turns one on.';
const notSwitchedOn = (named: string) => `${named} is not switched on. See /chains.`;

export function defaultChain<T extends ChainStrategy>(
  chains: T[],
  recipient?: string,
  configuredDefault?: string
): T {
  const matches = recipient ? chains.filter((c) => c.isAddress(recipient)) : [];
  const from = matches.length > 0 ? matches : chains;
  return (
    from.find((c) => c.id === configuredDefault) ?? from.find((c) => c.id === 'ethereum') ?? from[0]
  );
}

/** The strategy `--chain` names, from those switched on. */
export function pickStrategy<T extends ChainStrategy>(
  chains: T[],
  named: string
): { chain: T } | { error: string } {
  const chain = chains.find((c) => c.id === named);
  return chain ? { chain } : { error: notSwitchedOn(named) };
}

export type PickedSendable = {
  chain: ChainStrategy;
  /** Every chain that can send, for the forms to offer. */
  chains: ChainStrategy[];
  token?: string;
  rest: string[];
};

/**
 * A chain to send on: the one `--chain` names, else the default for the
 * recipient `recipientOf` finds among the positional args. Preferences are
 * only read when nothing was named.
 */
export async function pickSendable(
  context: PluginContext,
  args: string[],
  recipientOf: (rest: string[]) => string | undefined = () => undefined
): Promise<PickedSendable | { error: string }> {
  const chains = sendableChains();
  if (chains.length === 0) return { error: NO_CHAIN_ON };

  const named = chainFlag(args);
  const token = flagValue(args, '--token');
  const rest = withoutFlag(withoutChain(args), '--token');

  if (named) {
    const picked = pickStrategy(chains, named);
    return 'error' in picked ? picked : { ...picked, chains, token, rest };
  }

  const active = await activeChain(context);
  return { chain: defaultChain(chains, recipientOf(rest), active?.id), chains, token, rest };
}

export type Picked = { chain: WalletChain; rest: string[] };

export async function pickChain(
  context: PluginContext,
  args: string[]
): Promise<Picked | { error: string }> {
  const rest = withoutChain(args);
  const named = chainFlag(args);

  if (named) {
    const chain = walletChainById(named);
    if (!chain) return { error: `No chain called "${named}". /chains lists them.` };
    const enabled = await enabledIds(context);
    if (!enabled.includes(chain.id)) {
      return { error: `${chain.name} is switched off. Turn it on with /chains ${chain.id}.` };
    }
    return { chain, rest };
  }

  const active = await activeChain(context);
  if (!active) return { error: NO_CHAIN_ON };
  return { chain: active, rest };
}

export async function pickEvm(
  context: PluginContext,
  args: string[]
): Promise<{ chain: Chain; chainKey: string; rest: string[] } | { error: string }> {
  const picked = await pickChain(context, args);
  if ('error' in picked) return picked;
  if (!picked.chain.evm) {
    return {
      error: `That only works on an EVM chain, and ${picked.chain.name} is not one.`,
    };
  }
  return { chain: picked.chain.evm, chainKey: picked.chain.id, rest: picked.rest };
}

export async function chainsCard(context: PluginContext) {
  const enabled = await enabledIds(context);
  const active = await activeChain(context, enabled);

  return {
    kind: 'widget' as const,
    fallback: `${enabled.length} of ${CHAINS.length} chains on`,
    widget: W.card(
      [
        W.list(
          CHAINS.map((chain) => {
            const on = enabled.includes(chain.id);
            const isActive = active?.id === chain.id;
            return {
              title: chain.name,
              subtitle: chain.description,
              icon: chain.icon,
              state: on ? ('on' as const) : ('off' as const),
              status: chain.testnet
                ? isActive
                  ? 'Test · Default'
                  : 'Test'
                : isActive
                  ? 'Default'
                  : undefined,
              tone: on ? ('brand' as const) : undefined,
              actions: !on
                ? [
                    {
                      label: 'Turn on',
                      command: `/chains ${chain.id} on`,
                      icon: 'power' as const,
                    },
                  ]
                : isActive
                  ? []
                  : [
                      {
                        label: 'Make default',
                        command: `/chains ${chain.id} default`,
                        icon: 'star-outline' as const,
                      },
                      {
                        label: 'Turn off',
                        command: `/chains ${chain.id} off`,
                        icon: 'power' as const,
                        tone: 'danger' as const,
                      },
                    ],
            };
          })
        ),
        W.text(
          'Test chains are marked. Their coins come from a faucet and are worth ' +
            'nothing, which makes them the safe place to try a first send. ' +
            'A chain that is on can be sent from, watched and asked for a balance. ' +
            'The default is what a slash command means when it does not say --chain. ' +
            '/chains <id> or /chains <id> on turns one on without changing the default. ' +
            '/chains <id> default chooses an enabled chain as the default. ' +
            '/chains <id> off stops its polling; it deletes nothing. ' +
            'Choose another default before turning off the current one.'
        ),
      ],
      { title: 'Chains', icon: 'git-network-outline' }
    ),
  };
}

export function chainsCommand(context: PluginContext, views: { chains: PluginView }): SlashCommand {
  return {
    name: 'chains',
    aliases: ['chain'],
    showIn: ['channel'],
    description: 'Switch chains on and off, and choose the default',
    usage: '/chains [ethereum | base | bitcoin | …] [on | off | default]',
    async run({ args, respond }) {
      const [name, verb] = args;
      if (args.length > 2 || (verb && !['on', 'off', 'default'].includes(verb))) {
        return {
          type: 'error',
          message:
            'Use /chains <id> on to enable, default to choose an enabled chain, or off to disable a nondefault chain.',
        };
      }

      if (name) {
        const chain = walletChainById(name);
        if (!chain) {
          return { type: 'error', message: `No chain called "${name}". /chains lists them.` };
        }

        const enabled = await enabledIds(context);
        const isOn = enabled.includes(chain.id);

        try {
          if (verb === 'off') {
            if (!isOn) return { type: 'error', message: `${chain.name} is already off.` };
            await setEnabled(context, chain.id, false, enabled);
            return { type: 'notice', tone: 'success', message: `${chain.name} is off` };
          }
          if (verb === 'default') {
            await setActive(context, chain.id, enabled);
            return {
              type: 'notice',
              tone: 'success',
              message: `${chain.name} is the default now`,
            };
          }
          if (isOn) return { type: 'notice', message: `${chain.name} is already on` };
          await setEnabled(context, chain.id, true, enabled);
          return { type: 'notice', tone: 'success', message: `${chain.name} is on` };
        } catch (error) {
          return {
            type: 'error',
            message: errorMessage(error, 'Could not update chain preferences.'),
          };
        }
      }

      await respond(await views.chains());
      return { type: 'handled' };
    },
  };
}

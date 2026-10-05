import { groupCommands, groupComposerActions } from '@/core/commands/group';
import { parseCommand } from '@/core/commands/parser';
import { PluginRegistry } from '@/core/plugins/registry';

import { ALL_PLUGINS, DEFAULT_ENABLED_PLUGINS } from './index';
import { STATIM_BOT_ID } from './assistant/bot';
import { CHAINS, walletChainById } from './wallet/chain-list';
import { botChatId } from '@/core/messaging/bots';
import { asChatId } from '@/core/messaging/testing/ids';

const allCommands = ALL_PLUGINS.flatMap((plugin) => {
  const contribution = plugin.setup(stubContext());
  return (contribution.commands ?? []).map((command) => ({
    pluginId: plugin.manifest.id,
    command,
  }));
});

function stubContext() {
  const throwing = () => {
    throw new Error('not called during setup');
  };
  return {
    manifest: {
      id: 'x',
      name: 'x',
      description: '',
      version: '1',
      icon: 'ellipse',
      permissions: [],
    },
    storage: { get: async () => null, set: async () => {}, remove: async () => {} },
    account: {
      address: '0x0000000000000000000000000000000000000000',
      participantId: '',
      signMessage: throwing,
      signer: throwing,
      derive: throwing,
    },
    chat: {
      startDm: throwing,
      startGroup: throwing,
      send: throwing,
      sendText: throwing,
      sendCustom: throwing,
    },
    ui: {
      notify: () => {},
      openExternalUrl: throwing,
      openChat: () => {},
      openProfile: () => {},
      openSettings: () => {},
    },
    plugins: { list: () => [], setEnabled: throwing, commands: () => [] },
  } as never;
}

describe('every plugin', () => {
  it.each(ALL_PLUGINS.map((p) => [p.manifest.id, p] as const))(
    '%s has a complete manifest',
    (_id, plugin) => {
      const { manifest } = plugin;
      expect(manifest.id).toMatch(/^[a-z][a-z-]*$/);
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(manifest.permissions.length).toBeGreaterThan(0);
    }
  );

  it.each(ALL_PLUGINS.map((p) => [p.manifest.id, p] as const))(
    '%s contributes something',
    (_id, plugin) => {
      const c = plugin.setup(stubContext());
      const contributes =
        (c.commands?.length ?? 0) +
        (c.bots?.length ?? 0) +
        (c.contentTypes?.length ?? 0) +
        (c.overlays?.length ?? 0) +
        (c.uriHandlers?.length ?? 0);
      expect(contributes).toBeGreaterThan(0);
    }
  );
});

describe('every command', () => {
  it('has a valid usage line', () => {
    for (const { command } of allCommands) {
      expect(command.usage.startsWith('/')).toBe(true);
      expect(command.usage).toContain(command.name);
    }
  });

  it('resolves a shared name to the chat you are standing in', async () => {
    const registry = new PluginRegistry(ALL_PLUGINS);
    await Promise.all(
      ALL_PLUGINS.map((plugin) => registry.activate(plugin.manifest.id, stubContext))
    );

    const duplicated = new Map<string, Set<string>>();
    for (const { pluginId, command } of allCommands) {
      for (const key of [command.name, ...(command.aliases ?? [])]) {
        duplicated.set(key, new Set([...(duplicated.get(key) ?? []), pluginId]));
      }
    }

    for (const [key, owners] of duplicated) {
      if (owners.size === 1) continue;

      // Inside a plugin's own chat, its own command wins.
      for (const owner of owners) {
        const chat = channelIdOf(owner);
        if (!chat) continue;
        const resolved = registry.commandsFor(botChatId(chat), 'channel').get(key);
        if (resolved) expect(resolved.pluginId).toBe(owner);
      }

      // In a DM no plugin's chat breaks the tie, so at most one may claim the name.
      const inDm = [...owners].filter(
        (owner) => registry.commandsFor(asChatId('xmtp-abc'), 'dm').get(key)?.pluginId === owner
      );
      expect(inDm.length).toBeLessThanOrEqual(1);
    }
  });

  /** A `hidden` command runs but is never listed. */
  it.each(['dm', 'group', 'channel'] as const)(
    'dispatches only what it offers in a %s',
    async (scope) => {
      const registry = await activeRegistry();

      const chats =
        scope === 'channel'
          ? registry.bots().map((bot) => botChatId(bot.id))
          : [asChatId('xmtp-abc')];
      for (const chat of chats) {
        const offered = new Set(
          registry.commandListFor(chat, scope).map(({ command }) => command.name)
        );
        for (const [name, entry] of registry.commandsFor(chat, scope)) {
          expect(parseCommand(`/${name}`)).toEqual({ name, rest: '', args: [] });
          expect(offered.has(entry.command.name)).toBe(!entry.command.hidden);
        }
      }
    }
  );

  /** A composer chip and the command it dispatches each carry their own `showIn`. */
  it.each(['dm', 'group', 'channel'] as const)(
    'only offers a chip in a %s when its command runs there',
    async (scope) => {
      const registry = await activeRegistry();

      // Every plugin's chat: a chip is gated by the plugin that owns the chat it sits in.
      const chats =
        scope === 'channel'
          ? ALL_PLUGINS.flatMap((plugin) =>
              (plugin.setup(stubContext() as never).bots ?? []).map((bot) => botChatId(bot.id))
            )
          : [asChatId('xmtp-abc')];

      for (const chat of chats) {
        const runnable = registry.commandsFor(chat, scope);
        const offered = new Set(
          registry.commandListFor(chat, scope).map(({ command }) => command.name)
        );

        for (const { action } of registry.composerActionsFor(chat, scope)) {
          const parsed = parseCommand(action.command);
          const entry = parsed ? runnable.get(parsed.name) : undefined;
          expect({
            chip: action.id,
            scope,
            callable: Boolean(entry),
            discoverable: entry ? offered.has(entry.command.name) : false,
          }).toEqual({
            chip: action.id,
            scope,
            callable: true,
            discoverable: true,
          });
        }
      }
    }
  );

  it.each([
    ['bots', 'addbot'],
    ['markets', 'alert'],
  ])('prompts for arguments to /%s /%s without performing the action', async (pluginId, name) => {
    const context = stubContext();
    const command = ALL_PLUGINS.find((plugin) => plugin.manifest.id === pluginId)!
      .setup(context)
      .commands!.find((candidate) => candidate.name === name)!;
    const respond = jest.fn();

    expect(
      await command.run({
        args: [],
        rest: '',
        chatId: botChatId(pluginId),
        context,
        respond,
      })
    ).toEqual({ type: 'setComposer', text: `/${name} ` });
    expect(respond).not.toHaveBeenCalled();
  });

  /** Greetings are built at setup, so their buttons can be checked statically. */
  it('never offers a button its own chat cannot run', async () => {
    const registry = await activeRegistry();
    const wrong: string[] = [];

    for (const plugin of ALL_PLUGINS) {
      const contribution = plugin.setup(stubContext() as never);
      for (const bot of contribution.bots ?? []) {
        const chat = botChatId(bot.id);
        const runnable = registry.commandsFor(chat, 'channel');

        for (const line of bot.greeting()) {
          if (typeof line === 'string' || line.kind !== 'widget') continue;
          for (const command of commandsIn(line.widget)) {
            // `/draft /x ` hands `/x` to the composer; that is the one that
            // has to run here.
            const name = command
              .replace(/^\/draft\s+/, '')
              .replace(/^\//, '')
              .split(/\s/)[0];
            if (!runnable.has(name)) wrong.push(`${bot.id}: /${name}`);
          }
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it('never leaks a foreign command into a plugin chat', async () => {
    const registry = await activeRegistry();

    // Commands the app offers in every chat.
    const FURNITURE = ['commands'];

    for (const plugin of ALL_PLUGINS) {
      const contribution = plugin.setup(stubContext() as never);
      for (const bot of contribution.bots ?? []) {
        const foreign = registry
          .commandListFor(botChatId(bot.id), 'channel')
          .filter((e) => e.pluginId !== plugin.manifest.id)
          .filter((e) => !FURNITURE.includes(e.command.name))
          .map((e) => `/${e.command.name} from ${e.pluginId}`);

        expect({ chat: bot.id, foreign }).toEqual({ chat: bot.id, foreign: [] });
      }
    }
  });

  /** Pinned on purpose: a command without `showIn` lands in every DM and group. */
  it.each([
    ['dm', ['address', 'balance', 'commands', 'ens', 'move', 'profile', 'request', 'send']],
    [
      'group',
      [
        'address',
        'balance',
        'commands',
        'ens',
        'invite',
        'leave',
        'members',
        'profile',
        'remove',
        'rename',
        'request',
        'send',
        'split',
      ],
    ],
  ] as const)('offers exactly the agreed set in a %s', async (scope, expected) => {
    const registry = await activeRegistry();

    const offered = registry
      .commandListFor(asChatId('xmtp-abc'), scope)
      .map(({ command }) => command.name)
      .sort();

    expect(offered).toEqual([...expected]);
  });

  /** A chain whose strategy lacks `transfer` drops out of the `/send` picker silently. */
  it('lets every chain send its own coin', () => {
    expect(CHAINS.map((n) => n.id).sort()).toEqual([
      'arbitrum',
      'arbitrum-sepolia',
      'base',
      'base-sepolia',
      'bitcoin',
      'ethereum',
      'optimism',
      'optimism-sepolia',
      'polygon',
      'sepolia',
      'solana',
    ]);

    for (const chain of CHAINS) {
      const strategy = chain.strategy(stubContext() as never);
      expect({ id: chain.id, sends: typeof strategy.transfer?.commit }).toEqual({
        id: chain.id,
        sends: 'function',
      });
      expect({ id: chain.id, reads: typeof strategy.balance }).toEqual({
        id: chain.id,
        reads: 'function',
      });
    }
  });

  function commandsIn(widget: unknown): string[] {
    const node = widget as {
      kind?: string;
      command?: string;
      actions?: { command: string }[];
      rows?: { actions?: { command: string }[] }[];
      items?: { actions?: { command: string }[] }[];
      submit?: { command: string };
      children?: unknown[];
    };
    if (!node || typeof node !== 'object') return [];

    return [
      ...(node.actions ?? []).map((a) => a.command),
      ...(node.rows ?? []).flatMap((r) => (r.actions ?? []).map((a) => a.command)),
      ...(node.items ?? []).flatMap((i) => (i.actions ?? []).map((a) => a.command)),
      ...(node.submit ? [node.submit.command] : []),
      ...(node.children ?? []).flatMap(commandsIn),
    ];
  }

  async function activeRegistry(): Promise<PluginRegistry> {
    const registry = new PluginRegistry(ALL_PLUGINS, {
      commands: groupCommands,
      composerActions: groupComposerActions,
    });
    await Promise.all(
      ALL_PLUGINS.map((plugin) =>
        registry.activate(plugin.manifest.id, () => stubContext() as never)
      )
    );
    return registry;
  }

  function channelIdOf(pluginId: string): string | null {
    const plugin = ALL_PLUGINS.find((p) => p.manifest.id === pluginId);
    return plugin?.setup(stubContext()).bots?.[0]?.id ?? null;
  }
});

const allBots = ALL_PLUGINS.flatMap((plugin) =>
  (plugin.setup(stubContext()).bots ?? []).map((bot) => ({ pluginId: plugin.manifest.id, bot }))
);

describe('every bot', () => {
  it('has a unique id', () => {
    // A bot id becomes its chat id, so a collision gives two plugins one chat.
    const seen = new Map<string, string>();
    for (const { pluginId, bot } of allBots) {
      expect(seen.has(bot.id)).toBe(false);
      seen.set(bot.id, pluginId);
    }
  });

  it('has an id that survives being a URL path segment', () => {
    for (const { bot } of allBots) expect(bot.id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it('introduces itself', () => {
    for (const { bot } of allBots) {
      expect(bot.greeting().length).toBeGreaterThan(0);
      expect(bot.tagline.length).toBeGreaterThan(0);
    }
  });

  it('either speaks first or answers back', () => {
    for (const { bot } of allBots) {
      if (bot.id === STATIM_BOT_ID) continue;
      expect(Boolean(bot.activate) || Boolean(bot.onMessage)).toBe(true);
    }
  });
});

describe('defaults', () => {
  it('only enables plugins that exist', () => {
    const ids = new Set(ALL_PLUGINS.map((p) => p.manifest.id));
    for (const id of DEFAULT_ENABLED_PLUGINS) expect(ids.has(id)).toBe(true);
  });

  /** `assistant` provides the Statim chat and `profile` the core account commands. */
  it('starts with nothing optional switched on', () => {
    expect([...DEFAULT_ENABLED_PLUGINS].sort()).toEqual(['assistant', 'profile']);
  });
});

describe('every chain', () => {
  function stub() {
    return stubContext() as never;
  }

  it('is reachable by name and by id', () => {
    for (const chain of CHAINS) {
      expect(walletChainById(chain.id)?.id).toBe(chain.id);
      expect(walletChainById(chain.name)?.id).toBe(chain.id);
      expect(walletChainById(chain.name.toUpperCase())?.id).toBe(chain.id);
    }
    expect(walletChainById('bass')).toBeUndefined();
  });

  it('says which addresses are its own', () => {
    const evm = '0x0000000000000000000000000000000000000001';
    const btc = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

    const strategyOf = (id: string) => CHAINS.find((n) => n.id === id)!.strategy(stub());

    expect(strategyOf('ethereum').isAddress(evm)).toBe(true);
    expect(strategyOf('ethereum').isAddress(btc)).toBe(false);
    expect(strategyOf('bitcoin').isAddress(btc)).toBe(true);
    expect(strategyOf('bitcoin').isAddress(evm)).toBe(false);
  });

  /**
   * ENSIP-9 gives a name one record per coin, so Bitcoin must not share the EVM resolver.
   * Comparing what they return would need a chain, so this compares the functions.
   */
  it('resolves names its own way, or not at all', () => {
    const resolvers = Object.fromEntries(CHAINS.map((n) => [n.id, n.strategy(stub()).resolve]));

    expect(typeof resolvers.ethereum).toBe('function');
    expect(typeof resolvers.bitcoin).toBe('function');
    expect(resolvers.ethereum).not.toBe(resolvers.bitcoin);
    expect(resolvers.solana).toBeUndefined();
  });

  it('only lets viem-backed chains be watched', () => {
    const evmIds = CHAINS.filter((n) => n.evm).map((n) => n.id);
    expect(evmIds).toEqual([
      'ethereum',
      'base',
      'optimism',
      'arbitrum',
      'polygon',
      'sepolia',
      'optimism-sepolia',
      'base-sepolia',
      'arbitrum-sepolia',
    ]);
  });
});

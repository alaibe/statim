import { isRecord, isString, shape } from '@/lib/guards';

import { capabilitiesOf } from '../account/account-kind';
import type { WalletKeys } from '../account/keyring';

import { PluginRegistry, worksOn } from './registry';
import { contentType, type Plugin, type PluginContext } from './types';
import { botChatId } from '@/core/messaging/bots';
import { asChatId } from '@/core/messaging/testing/ids';

function stubContext(): PluginContext {
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
      accountId: 'test-account',
      capabilities: capabilitiesOf({ kind: 'phrase', wallet: {} as WalletKeys }),
      address: '0x0000000000000000000000000000000000000000',
      participantId: 'inbox',
      signMessage: async () => '0x',
      signer: () => {
        throw new Error('not needed in tests');
      },
      derive: () => {
        throw new Error('not needed in tests');
      },
      deriveEd25519: () => {
        throw new Error('not needed in tests');
      },
    },
    chat: {
      startDm: async () => null,
      startGroup: async () => ({ chatId: asChatId('g'), unreachable: [] }),
      send: async () => {},
      sendText: async () => {},
      sendCustom: async () => {},
      members: async () => [],
    },
    ui: {
      notify: () => {},
      openExternalUrl: async () => {},
      openChat: () => {},
      openProfile: () => {},
      openSettings: () => {},
    },
    plugins: {
      list: () => [],
      setEnabled: async () => {},
      commands: () => [],
      channelOwner: () => undefined,
    },
  };
}

function makePlugin(id: string, contribution: Partial<ReturnType<Plugin['setup']>> = {}): Plugin {
  return {
    manifest: {
      id,
      name: id,
      description: '',
      version: '1.0.0',
      icon: 'ellipse',
      permissions: [],
    },
    setup: () => contribution,
  };
}

const activate = (registry: PluginRegistry, id: string) => registry.activate(id, stubContext);

describe('PluginRegistry', () => {
  it('rejects duplicate plugin ids', () => {
    const registry = new PluginRegistry([makePlugin('a')]);
    expect(() => registry.register(makePlugin('a'))).toThrow(/Duplicate plugin id/);
  });

  it('contributes nothing until a plugin is activated', async () => {
    const plugin = makePlugin('a', {
      commands: [
        { name: 'hi', description: '', usage: '', run: async () => ({ type: 'handled' }) },
      ],
    });
    const registry = new PluginRegistry([plugin]);

    expect(registry.commandListFor(asChatId('xmtp-abc'))).toHaveLength(0);
    await activate(registry, 'a');
    expect(registry.commandListFor(asChatId('xmtp-abc'))).toHaveLength(1);
  });

  it('offers a core feature only while it is on, and says so to subscribers', () => {
    let on = false;
    let notify = () => {};
    const registry = new PluginRegistry([], {
      features: [
        {
          commands: [
            { name: 'hi', description: '', usage: '', run: async () => ({ type: 'handled' }) },
          ],
          composerActions: [{ id: 'hi', label: 'Hi', icon: 'ellipse', command: '/hi' }],
          isOn: () => on,
          subscribe: (listener) => {
            notify = listener;
            return () => {};
          },
        },
      ],
    });
    const changed = jest.fn();
    registry.subscribe(changed);
    const chat = asChatId('xmtp-abc');

    expect(registry.commandListFor(chat)).toHaveLength(0);
    on = true;
    notify();
    expect(changed).toHaveBeenCalled();
    expect(registry.commandListFor(chat).map(({ command }) => command.name)).toEqual(['hi']);
    expect(registry.composerActionsFor(chat)).toHaveLength(1);
  });

  it('registers aliases alongside the primary command name', async () => {
    const registry = new PluginRegistry([
      makePlugin('a', {
        commands: [
          {
            name: 'balance',
            aliases: ['bal'],
            description: '',
            usage: '',
            run: async () => ({ type: 'handled' }),
          },
        ],
      }),
    ]);
    await activate(registry, 'a');

    const commands = registry.commands();
    expect(commands.get('balance')).toBeDefined();
    expect(commands.get('bal')).toBeDefined();
    // The dedupe list is for the autocomplete, so aliases must not appear twice.
    expect(registry.commandListFor(asChatId('xmtp-abc'))).toHaveLength(1);
  });

  it('lets the first plugin keep a contested command name', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const command = (name: string) => ({
      name,
      description: '',
      usage: '',
      run: async () => ({ type: 'handled' as const }),
    });

    const registry = new PluginRegistry([
      makePlugin('first', { commands: [command('send')] }),
      makePlugin('second', { commands: [command('send')] }),
    ]);
    await activate(registry, 'first');
    await activate(registry, 'second');

    expect(registry.commands().get('send')?.pluginId).toBe('first');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('derives one codec per registered content type', async () => {
    const registry = new PluginRegistry([
      makePlugin('eth', {
        contentTypes: [
          {
            typeId: 'eth.payment.request',
            is: isRecord,
            fallback: () => 'payment',
            render: () => null,
          },
        ],
      }),
    ]);
    await activate(registry, 'eth');

    const specs = registry.contentTypeSpecs();
    expect(specs).toHaveLength(1);
    expect(specs[0].typeId).toBe('eth.payment.request');
    expect(specs[0].fallback({ amount: '1' })).toBe('payment');
  });

  it('renders a custom message only when its payload parses', async () => {
    const render = () => null;
    const is = shape<{ amount: string }>({ amount: isString });
    const registry = new PluginRegistry([
      makePlugin('eth', {
        contentTypes: [
          contentType({
            typeId: 'eth.payment.request',
            is,
            fallback: (data) => data.amount,
            render,
          }),
        ],
      }),
    ]);
    await activate(registry, 'eth');

    expect(registry.customRenderer('eth.payment.request', { amount: '1' })).toMatchObject({
      render,
      data: { amount: '1' },
    });
    expect(registry.customRenderer('eth.payment.request', { amount: {} })).toBeNull();
    expect(registry.customRenderer('eth.payment.request', null)).toBeNull();
    expect(registry.customRenderer('eth.payment.split', { amount: '1' })).toBeNull();
  });

  it('routes a URI to the plugin claiming its scheme', async () => {
    const seen: string[] = [];
    const registry = new PluginRegistry([
      makePlugin('eth', {
        uriHandlers: [
          {
            schemes: ['ethereum'],
            handle: async (url) => {
              seen.push(url);
              return true;
            },
          },
        ],
      }),
    ]);
    await activate(registry, 'eth');

    expect(await registry.handleUri('ethereum:0xabc')).toBe(true);
    expect(await registry.handleUri('wc:topic@2')).toBe(false);
    expect(seen).toEqual(['ethereum:0xabc']);
  });

  it('runs the disposer returned by start() when deactivated', async () => {
    const dispose = jest.fn();
    const registry = new PluginRegistry([makePlugin('a', { start: async () => dispose })]);

    await activate(registry, 'a');
    expect(registry.isActive('a')).toBe(true);
    expect(dispose).not.toHaveBeenCalled();

    await registry.deactivate('a');
    expect(registry.isActive('a')).toBe(false);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('revokes context before running its disposer', async () => {
    const events: string[] = [];
    const registry = new PluginRegistry([
      makePlugin('a', { start: async () => () => events.push('dispose') }),
    ]);

    await registry.activate('a', stubContext, () => events.push('revoke'));
    await registry.deactivate('a');

    expect(events).toEqual(['revoke', 'dispose']);
  });

  it('disposes startup that finishes after deactivation', async () => {
    const dispose = jest.fn();
    let finish!: (dispose: () => void) => void;
    const started = new Promise<() => void>((resolve) => {
      finish = resolve;
    });
    const registry = new PluginRegistry([makePlugin('a', { start: () => started })]);

    const activating = activate(registry, 'a');
    await Promise.resolve();
    await registry.deactivate('a');
    finish(dispose);
    await activating;

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(registry.isActive('a')).toBe(false);
  });

  it('does not attach a late old disposer to a new activation', async () => {
    const oldDispose = jest.fn();
    const newDispose = jest.fn();
    let finish!: (dispose: () => void) => void;
    const oldStart = new Promise<() => void>((resolve) => {
      finish = resolve;
    });
    let starts = 0;
    const registry = new PluginRegistry([
      makePlugin('a', { start: () => (starts++ === 0 ? oldStart : Promise.resolve(newDispose)) }),
    ]);

    const oldActivation = activate(registry, 'a');
    await Promise.resolve();
    await registry.deactivate('a');
    await activate(registry, 'a');
    finish(oldDispose);
    await oldActivation;
    await registry.deactivate('a');

    expect(oldDispose).toHaveBeenCalledTimes(1);
    expect(newDispose).toHaveBeenCalledTimes(1);
  });

  it('drops contributions once a plugin is deactivated', async () => {
    const registry = new PluginRegistry([
      makePlugin('a', {
        overlays: [{ id: 'sheet', component: () => null }],
      }),
    ]);

    await activate(registry, 'a');
    expect(registry.overlays()).toHaveLength(1);

    await registry.deactivate('a');
    expect(registry.overlays()).toHaveLength(0);
  });
});

describe('channel scoping', () => {
  /** A plugin that owns a channel and contributes one command and one chip. */
  const channelPlugin = (id: string, extra: Partial<ReturnType<Plugin['setup']>> = {}) =>
    makePlugin(id, {
      bots: [{ id, name: id, tagline: '', greeting: () => [] }],
      commands: [
        {
          name: `${id}-cmd`,
          description: '',
          usage: '',
          run: async () => ({ type: 'handled' as const }),
        },
      ],
      composerActions: [{ id: `${id}-chip`, label: id, icon: 'ellipse', command: `/${id}-cmd` }],
      ...extra,
    });

  const withChannels = async () => {
    const registry = new PluginRegistry([
      channelPlugin('ethereum'),
      channelPlugin('bitcoin'),
      makePlugin('assistant', {
        commands: [
          {
            name: 'commands',
            description: '',
            usage: '',
            global: true,
            run: async () => ({ type: 'handled' as const }),
          },
        ],
        composerActions: [
          {
            id: 'chip-commands',
            label: 'Commands',
            icon: 'ellipse',
            command: '/commands',
            global: true,
          },
        ],
      }),
    ]);
    for (const id of ['ethereum', 'bitcoin', 'assistant']) await activate(registry, id);
    return registry;
  };

  it('knows which plugin owns a channel', async () => {
    const registry = await withChannels();

    expect(registry.channelOwner(botChatId('ethereum'))).toBe('ethereum');
    expect(registry.channelOwner(botChatId('bitcoin'))).toBe('bitcoin');
    // A DM is nobody's channel.
    expect(registry.channelOwner(asChatId('xmtp-0xabc'))).toBeUndefined();
  });

  it('does not answer another plugin’s command inside a channel', async () => {
    const inEthereum = (await withChannels()).commandsFor(botChatId('ethereum'));

    expect(inEthereum.has('ethereum-cmd')).toBe(true);
    expect(inEthereum.has('bitcoin-cmd')).toBe(false);
  });

  it('keeps global commands available inside every channel', async () => {
    const registry = await withChannels();

    expect(registry.commandsFor(botChatId('ethereum')).has('commands')).toBe(true);
    expect(registry.commandsFor(botChatId('bitcoin')).has('commands')).toBe(true);
  });

  it('scopes the autocomplete the same way it scopes dispatch', async () => {
    const names = (await withChannels())
      .commandListFor(botChatId('bitcoin'))
      .map((e) => e.command.name)
      .sort();

    expect(names).toEqual(['bitcoin-cmd', 'commands']);
  });

  it('scopes composer chips the same way', async () => {
    const ids = (await withChannels())
      .composerActionsFor(botChatId('ethereum'))
      .map((e) => e.action.id)
      .sort();

    expect(ids).toEqual(['chip-commands', 'ethereum-chip']);
  });

  it('scopes nothing outside a plugin channel', async () => {
    const registry = await withChannels();

    expect(registry.commandsFor(asChatId('xmtp-0xabc')).size).toBe(registry.commands().size);
    expect(registry.commandListFor(asChatId('xmtp-0xabc')).map((e) => e.command.name)).toEqual([
      'bitcoin-cmd',
      'commands',
      'ethereum-cmd',
    ]);
    expect(registry.composerActionsFor(asChatId('xmtp-0xabc'))).toHaveLength(
      registry.composerActions().length
    );
  });

  it('offers a group command only in a group', async () => {
    const registry = new PluginRegistry([
      makePlugin('groups', {
        commands: [
          {
            name: 'rename',
            description: '',
            usage: '',
            showIn: ['group'] as const,
            run: async () => ({ type: 'handled' as const }),
          },
          {
            name: 'dm',
            description: '',
            usage: '',
            run: async () => ({ type: 'handled' as const }),
          },
        ],
      }),
    ]);
    await activate(registry, 'groups');

    expect(registry.commandsFor(asChatId('xmtp-abc'), 'group').has('rename')).toBe(true);
    expect(registry.commandsFor(asChatId('xmtp-abc'), 'dm').has('rename')).toBe(false);
    // A command with no `showIn` is offered everywhere.
    expect(registry.commandsFor(asChatId('xmtp-abc'), 'dm').has('dm')).toBe(true);
  });

  it('offers a command only where the protocol can do what it needs', () => {
    const command = {
      name: 'poll',
      description: '',
      usage: '',
      requires: 'createPoll' as const,
      run: async () => ({ type: 'handled' as const }),
    };
    expect(worksOn(command, { createPoll: async () => {} } as never)).toBe(true);
    expect(worksOn(command, {} as never)).toBe(false);
    expect(worksOn({ ...command, requires: undefined }, undefined)).toBe(true);
  });

  it('offers a command that posts a content type only where the protocol carries one', () => {
    const command = {
      name: 'request',
      description: '',
      usage: '',
      sendsCustom: true,
      run: async () => ({ type: 'handled' as const }),
    };
    expect(worksOn(command, { sendsCustom: true } as never)).toBe(true);
    expect(worksOn(command, {} as never)).toBe(false);
    expect(worksOn(command, undefined)).toBe(false);
  });

  it('needs both gates, not either', async () => {
    // `ethereum-cmd` declares no `showIn`, so only ownership refuses it in Bitcoin's channel.
    const registry = await withChannels();

    expect(registry.commandsFor(botChatId('bitcoin'), 'channel').has('ethereum-cmd')).toBe(false);
    expect(registry.commandsFor(botChatId('ethereum'), 'channel').has('ethereum-cmd')).toBe(true);
  });

  it('forgets channel ownership when a plugin is disabled', async () => {
    const registry = await withChannels();
    await registry.deactivate('ethereum');

    expect(registry.channelOwner(botChatId('ethereum'))).toBeUndefined();
  });

  it("exposes a plugin's views only while it is on", async () => {
    const view = async () => ({
      kind: 'widget' as const,
      widget: { kind: 'text' as const, text: 'now' },
      fallback: 'now',
    });
    const registry = new PluginRegistry([makePlugin('a', { views: { list: view } })]);

    expect(registry.view('a', 'list')).toBeUndefined();
    await activate(registry, 'a');
    expect(registry.view('a', 'list')).toBe(view);
    expect(registry.view('a', 'other')).toBeUndefined();

    await registry.deactivate('a');
    expect(registry.view('a', 'list')).toBeUndefined();
  });

  it('merges the names active plugins give participants, skipping one that fails', async () => {
    const registry = new PluginRegistry([
      makePlugin('bots', { names: async () => ({ 'inbox-1': 'Weather' }) }),
      makePlugin('broken', { names: async () => Promise.reject(new Error('storage')) }),
      makePlugin('idle', { names: async () => ({ 'inbox-2': 'Never active' }) }),
    ]);
    await activate(registry, 'bots');
    await activate(registry, 'broken');

    expect(await registry.participantNames()).toEqual({ 'inbox-1': 'Weather' });
  });

  it('lets an active plugin claim a text message for one of its views', async () => {
    const claims = (prefix: string) => [
      { view: 'card', match: (text: string) => (text.startsWith(prefix) ? [text] : null) },
    ];
    const registry = new PluginRegistry([
      makePlugin('off', { textPreviews: claims('hi') }),
      makePlugin('on', { textPreviews: claims('hi') }),
    ]);
    await activate(registry, 'on');

    expect(registry.textPreview('hi there')).toEqual({
      pluginId: 'on',
      view: 'card',
      args: ['hi there'],
    });
    expect(registry.textPreview('bye')).toBeNull();
  });
});

import { liveViews } from '@/core/plugins/live';
import type { PluginContext } from '@/core/plugins/types';
import type { Widget } from '@/design/widgets';
import type { WidgetListItem } from '@/design/widgets/schema';

import {
  activeChain,
  disposeStrategies,
  enabledIds,
  chainsCard,
  chainsCommand,
  setActive,
  setEnabled,
} from './chain-list';
import { botChatId } from '@/core/messaging/bots';

jest.mock('./bitcoin/bot', () => ({ checkAddress: jest.fn() }));
jest.mock('./bitcoin', () => ({ bitcoinStrategy: () => ({ id: 'bitcoin' }) }));
jest.mock('./bitcoin/config', () => ({ hydrateApiBase: jest.fn() }));
jest.mock('./solana', () => ({ solanaStrategy: { id: 'solana' } }));
jest.mock('./chains/watcher', () => ({ checkBalances: jest.fn() }));
jest.mock('./chains/rpc', () => ({ hydrateRpcOverrides: jest.fn() }));
jest.mock('./chains/evm', () => ({
  EVM_CHAINS: [
    { id: 'ethereum', name: 'Ethereum', icon: 'diamond-outline', description: 'Mainnet' },
    { id: 'base', name: 'Base', icon: 'ellipse-outline', description: 'L2' },
    {
      id: 'sepolia',
      name: 'Sepolia',
      icon: 'diamond-outline',
      description: 'Testnet',
      testnet: true,
    },
  ],
  evmStrategy: (spec: { id: string }) => ({ id: spec.id }),
}));

function makeContext(enabled: string[] = ['ethereum'], active?: string): PluginContext {
  const values = new Map<string, unknown>([['chains', enabled]]);
  if (active) values.set('active-chain', active);
  return {
    manifest: { id: 'wallet' },
    storage: {
      get: async <T>(key: string) => (values.get(key) as T | undefined) ?? null,
      set: async (key: string, value: unknown) => {
        values.set(key, value);
      },
      remove: async (key: string) => {
        values.delete(key);
      },
    },
  } as unknown as PluginContext;
}

async function run(context: PluginContext, command = '/chains') {
  const args = command.split(' ').slice(1);
  let widget: Widget | undefined;
  const views = liveViews(context, { chains: () => chainsCard(context) });
  const result = await chainsCommand(context, views).run({
    args,
    rest: args.join(' '),
    chatId: botChatId('payments'),
    context,
    respond: async (content) => {
      if (typeof content !== 'string' && content.kind === 'widget') widget = content.widget;
    },
  });
  return { result, items: itemsOf(widget) };
}

function itemsOf(widget: Widget | undefined): WidgetListItem[] {
  if (widget?.kind === 'list') return widget.items;
  return widget?.kind === 'card' ? widget.children.flatMap(itemsOf) : [];
}

afterEach(disposeStrategies);

describe('/chains enabled and default preferences', () => {
  it('preserves an unsaved effective default when an earlier chain is enabled', async () => {
    const context = makeContext(['base']);

    expect((await run(context, '/chains ethereum on')).result.type).toBe('notice');
    expect(await enabledIds(context)).toEqual(['base', 'ethereum']);
    expect((await activeChain(context))?.id).toBe('base');

    await run(context, '/chains ethereum');
    expect((await activeChain(context))?.id).toBe('base');
  });

  it('requires an enabled chain for explicit default selection', async () => {
    const context = makeContext(['ethereum'], 'ethereum');

    expect((await run(context, '/chains base default')).result.type).toBe('error');
    expect(await enabledIds(context)).toEqual(['ethereum']);
    expect((await activeChain(context))?.id).toBe('ethereum');

    await run(context, '/chains base');
    expect(await enabledIds(context)).toEqual(['ethereum', 'base']);
    expect((await activeChain(context))?.id).toBe('ethereum');

    expect((await run(context, '/chains base default')).result.type).toBe('notice');
    expect((await activeChain(context))?.id).toBe('base');
    expect(await enabledIds(context)).toEqual(['ethereum', 'base']);
  });

  it.each([undefined, 'ethereum'])(
    'protects a default from off with stored default %s',
    async (active) => {
      const context = makeContext(['ethereum', 'base'], active);

      expect((await run(context, '/chains ethereum off')).result.type).toBe('error');
      expect(await enabledIds(context)).toEqual(['ethereum', 'base']);
      expect((await activeChain(context))?.id).toBe('ethereum');

      expect((await run(context, '/chains base off')).result.type).toBe('notice');
      expect(await enabledIds(context)).toEqual(['ethereum']);
      expect((await activeChain(context))?.id).toBe('ethereum');
    }
  );

  it('enforces the same invariants for direct preference mutations', async () => {
    const context = makeContext(['ethereum']);

    await expect(setEnabled(context, 'ethereum', false)).rejects.toThrow();
    await expect(setActive(context, 'base')).rejects.toThrow();
    expect(await enabledIds(context)).toEqual(['ethereum']);
    expect((await activeChain(context))?.id).toBe('ethereum');
  });

  it('recovers an all-off legacy state without letting later enables replace its initial default', async () => {
    const context = makeContext([], 'ethereum');

    await run(context, '/chains base on');
    expect(await enabledIds(context)).toEqual(['base']);
    expect((await activeChain(context))?.id).toBe('base');

    await run(context, '/chains ethereum on');
    expect(await enabledIds(context)).toEqual(['base', 'ethereum']);
    expect((await activeChain(context))?.id).toBe('base');
  });

  it.each(['/chains base disable', '/chains base on default'])(
    'rejects unsupported syntax without changing preferences: %s',
    async (command) => {
      const context = makeContext();

      expect((await run(context, command)).result.type).toBe('error');
      expect(await enabledIds(context)).toEqual(['ethereum']);
      expect((await activeChain(context))?.id).toBe('ethereum');
    }
  );

  it('offers enable-only taps and nondefault options, and rejects stale off actions', async () => {
    const context = makeContext();
    const initial = await run(context);
    expect(initial.items.find((item) => item.title === 'Ethereum')?.actions).toEqual([]);
    const disabled = initial.items.find((item) => item.title === 'Base')!;
    expect(disabled.state).toBe('off');
    expect(disabled.actions?.map((action) => action.command)).toEqual(['/chains base on']);
    expect(disabled.actions?.[0].tone).not.toBe('danger');

    expect((await run(context, disabled.actions![0].command)).result.type).toBe('notice');
    const base = (await run(context)).items.find((item) => item.title === 'Base')!;
    expect(base.state).toBe('on');
    expect(base.actions?.map((action) => action.command)).toEqual([
      '/chains base default',
      '/chains base off',
    ]);
    expect((await activeChain(context))?.id).toBe('ethereum');

    expect((await run(context, base.actions![0].command)).result.type).toBe('notice');
    const selected = await run(context);
    expect(selected.items.find((item) => item.title === 'Base')?.actions).toEqual([]);
    expect((await run(context, base.actions![1].command)).result.type).toBe('error');
    expect(await enabledIds(context)).toEqual(['ethereum', 'base']);
    expect((await activeChain(context))?.id).toBe('base');

    const ethereum = selected.items.find((item) => item.title === 'Ethereum')!;
    expect((await run(context, ethereum.actions![1].command)).result.type).toBe('notice');
    expect(await enabledIds(context)).toEqual(['base']);
  });

  it('keeps a testnet default visibly marked as both test and default', async () => {
    const context = makeContext(['ethereum', 'sepolia']);
    expect((await run(context, '/chains sepolia default')).result.type).toBe('notice');
    const sepolia = (await run(context)).items.find((item) => item.title === 'Sepolia')!;

    expect(sepolia.status).toMatch(/test/i);
    expect(sepolia.status).toMatch(/default/i);
    expect(sepolia.actions).toEqual([]);
    expect((await run(context, '/chains sepolia off')).result.type).toBe('error');
    expect((await activeChain(context))?.id).toBe('sepolia');
  });
});

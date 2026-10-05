import { formatEther, parseEther } from 'viem';

import { STATIM_LOCAL_ID } from '@/core/messaging/bots';
import type { PluginContext } from '@/core/plugins/types';
import { trimDecimals } from '@/lib/evm/chains';

import { walletCommands } from './commands';
import type { SplitRequest } from './types';

jest.mock('./bitcoin/bot', () => ({ checkAddress: jest.fn() }));
jest.mock('./bitcoin', () => ({ bitcoinStrategy: jest.fn() }));
jest.mock('./bitcoin/config', () => ({ hydrateApiBase: jest.fn() }));
jest.mock('./solana', () => ({ solanaStrategy: {} }));
jest.mock('./chains/watcher', () => ({ checkBalances: jest.fn() }));

/** Wei per person, the exact figure the card asks each member for. */
function shareWei(total: string, people: number): bigint {
  return parseEther(total) / BigInt(people);
}

/** What the card prints, rounded for legibility. */
function shareOf(total: string, people: number): string {
  return trimDecimals(formatEther(shareWei(total, people)));
}

describe('splitting a bill', () => {
  it('divides evenly when it divides evenly', () => {
    expect(shareOf('120', 4)).toBe('30');
    expect(shareOf('0.32', 4)).toBe('0.08');
  });

  it('counts the person who paid as one of the ways', () => {
    const share = shareOf('100', 4);
    expect(Number(share) * 4).toBeCloseTo(100, 6);
  });

  it('never rounds a share up past the total', () => {
    // Checked in wei: the printed share is rounded and can read a hair above the true one.
    for (const people of [3, 6, 7, 9]) {
      expect(shareWei('10', people) * BigInt(people)).toBeLessThanOrEqual(parseEther('10'));
    }
  });

  it('handles an amount that does not divide cleanly', () => {
    const share = shareOf('10', 3);
    expect(Number(share)).toBeCloseTo(3.333333, 5);
  });

  it('handles two people', () => {
    expect(shareOf('0.05', 2)).toBe('0.025');
  });
});

describe('/split --chain', () => {
  async function split(args: string[], stored: Record<string, unknown> = {}) {
    const sent: SplitRequest[] = [];
    const context = {
      account: { address: '0x0000000000000000000000000000000000000001' },
      storage: { get: async (key: string) => stored[key] ?? null },
      chat: {
        members: async () => ['me', 'them'],
        sendCustom: async (_chat: unknown, _type: unknown, payload: SplitRequest) => {
          sent.push(payload);
        },
      },
    } as unknown as PluginContext;
    const result = await walletCommands
      .find((command) => command.name === 'split')!
      .run({
        args,
        rest: args.join(' '),
        context,
        chatId: STATIM_LOCAL_ID,
        respond: async () => {},
      });
    return { result, sent };
  }

  it('takes the chain ids /chains lists', async () => {
    expect((await split(['1', '--chain', 'optimism'])).sent[0]?.chainId).toBe(10);
    expect((await split(['1', '--chain', 'arbitrum'])).sent[0]?.chainId).toBe(42161);
  });

  it('uses the wallet default without one, or Base when a split cannot use it', async () => {
    const withDefault = (active: string) => ({
      chains: ['ethereum', active],
      'active-chain': active,
    });
    expect((await split(['1'])).sent[0]?.chainId).toBe(1);
    expect((await split(['1'], withDefault('optimism'))).sent[0]?.chainId).toBe(10);
    expect((await split(['1'], withDefault('bitcoin'))).sent[0]?.chainId).toBe(8453);
    expect((await split(['1'], withDefault('sepolia'))).sent[0]?.chainId).toBe(8453);
  });

  it('refuses a chain it cannot split on instead of using Base', async () => {
    for (const named of ['nope', 'bitcoin', 'sepolia']) {
      const { result, sent } = await split(['1', '--chain', named]);
      expect(result.type).toBe('error');
      expect(sent).toEqual([]);
    }
  });
});

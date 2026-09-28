import { EVM_CHAINS } from './evm';
import { balanceChangeMessage } from './watcher';

describe('balanceChangeMessage', () => {
  it.each(EVM_CHAINS.map((spec) => [spec.id, spec] as const))(
    'gives the %s card buttons a --chain that /balance and /explorer accept',
    (id, spec) => {
      const card = balanceChangeMessage({
        spec,
        target: { address: '0x0000000000000000000000000000000000000001', label: 'You' },
        previous: 1n,
        current: 2n,
      });
      const named = [...JSON.stringify(card).matchAll(/--chain (\S+?)"/g)].map((m) => m[1]);
      expect(named).toEqual([id, id]);
    }
  );
});

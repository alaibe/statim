import {
  parseTransaction,
  recoverMessageAddress,
  recoverTransactionAddress,
  recoverTypedDataAddress,
  serializeTransaction,
  type TransactionSerializable,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import {
  DEFAULT_EVM_PATH,
  hardwareAccount,
  parityOf,
  typedDataJson,
  type TypedData,
} from './hardware';
import { FakeHardwareSigner } from './testing/fake-hardware';

const KEY = `0x${'11'.repeat(32)}` as const;
const ADDRESS = privateKeyToAccount(KEY).address;
const account = (device = new FakeHardwareSigner(KEY)) => hardwareAccount(device, ADDRESS);

const TYPED: TypedData = {
  domain: {
    name: 'Permit2',
    chainId: 8453,
    verifyingContract: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  },
  types: { Permit: [{ name: 'amount', type: 'uint256' }] },
  primaryType: 'Permit',
  message: { amount: 10n ** 18n },
};

describe('hardwareAccount', () => {
  it('signs text and raw bytes the address verifies', async () => {
    const text = await account().signMessage({ message: 'hello' });
    expect(await recoverMessageAddress({ message: 'hello', signature: text })).toBe(ADDRESS);

    const raw = await account().signMessage({ message: { raw: '0xdeadbeef' } });
    expect(await recoverMessageAddress({ message: { raw: '0xdeadbeef' }, signature: raw })).toBe(
      ADDRESS
    );
  });

  it('returns a signed transaction of every type that recovers to the address', async () => {
    const transactions: TransactionSerializable[] = [
      {
        chainId: 1,
        to: ADDRESS,
        value: 1n,
        nonce: 3,
        gas: 21000n,
        maxFeePerGas: 2n,
        maxPriorityFeePerGas: 1n,
      },
      {
        chainId: 8453,
        to: ADDRESS,
        value: 1n,
        nonce: 0,
        gas: 21000n,
        gasPrice: 5n,
        type: 'legacy',
      },
    ];
    for (const transaction of transactions) {
      const signed = await account().signTransaction(transaction);
      expect(await recoverTransactionAddress({ serializedTransaction: signed as never })).toBe(
        ADDRESS
      );
      expect(parseTransaction(signed).to?.toLowerCase()).toBe(ADDRESS.toLowerCase());
    }
  });

  it('signs EIP-712 data the address verifies', async () => {
    const signature = await account().signTypedData(TYPED as never);
    expect(await recoverTypedDataAddress({ ...TYPED, signature } as never)).toBe(ADDRESS);
  });

  it('asks the device every time and passes its refusal on', async () => {
    const device = new FakeHardwareSigner(KEY);
    await account(device).signMessage({ message: 'x' });
    expect(device.calls).toEqual([`signMessage:${DEFAULT_EVM_PATH}`]);

    device.refuse = true;
    await expect(account(device).signMessage({ message: 'x' })).rejects.toThrow(/Rejected/);
  });
});

describe('parityOf', () => {
  it('reads every form a device gives v in', () => {
    expect(parityOf(0, {})).toBe(0);
    expect(parityOf(28, {})).toBe(1);
    expect(parityOf(38, { chainId: 1 })).toBe(1);
    // EIP-155 on Base: 35 + 2 × 8453 + 1 = 16942, which a Ledger truncates to 0x2e.
    expect(parityOf(16942 % 256, { chainId: 8453 })).toBe(1);
    expect(parityOf(16941 % 256, { chainId: 8453 })).toBe(0);
  });
});

describe('typedDataJson', () => {
  it('spells out the domain type and writes big numbers as text', () => {
    const parsed = JSON.parse(typedDataJson(TYPED));
    expect(parsed.types.EIP712Domain.map((field: { name: string }) => field.name)).toEqual([
      'name',
      'chainId',
      'verifyingContract',
    ]);
    expect(parsed.message.amount).toBe('1000000000000000000');
  });
});

it('keeps the unsigned form a device hashes for EIP-155', () => {
  expect(serializeTransaction({ chainId: 1, gasPrice: 1n, nonce: 0, type: 'legacy' })).toMatch(
    /^0x/
  );
});

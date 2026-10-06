import { UR } from '@ngraveio/bc-ur';
import {
  CryptoHDKey,
  CryptoKeypath,
  DataType,
  EthSignRequest,
  ETHSignature,
  PathComponent,
} from '@keystonehq/bc-ur-registry-eth';
import { english, generateMnemonic, HDKey, mnemonicToAccount } from 'viem/accounts';
import { mnemonicToSeedSync } from '@scure/bip39';

import { encodeUr, keystoneSigner, readAccountUr, urReader } from './keystone';

const MNEMONIC = generateMnemonic(english);
const ACCOUNT = {
  address: mnemonicToAccount(MNEMONIC).address,
  path: "m/44'/60'/0'/0/0",
  xfp: '12345678',
};

const signatureUr = (signature: Buffer) =>
  new ETHSignature(signature, Buffer.from('0'.repeat(32), 'hex')).toUR();

function readAll(frames: string[]): UR | null {
  const reader = urReader();
  for (const frame of frames) {
    const result = reader.read(frame);
    if (typeof result !== 'number') return result;
  }
  return null;
}

function answering(signature: Buffer) {
  const seen: EthSignRequest[] = [];
  return {
    seen,
    exchange: async ({ parts }: { parts: string[] }) => {
      seen.push(EthSignRequest.fromCBOR(readAll(parts)!.cbor));
      return signatureUr(signature);
    },
  };
}

describe('UR framing', () => {
  it('round-trips a payload, split into several frames when it is big', () => {
    const big = new UR(Buffer.alloc(2_000, 7), 'bytes');
    const parts = encodeUr(big, 100);
    expect(parts.length).toBeGreaterThan(1);
    expect(readAll(parts)?.cbor.equals(big.cbor)).toBe(true);
  });

  it('reports progress on part of a scan and refuses what is not a UR', () => {
    const parts = encodeUr(new UR(Buffer.alloc(2_000, 7), 'bytes'), 100);
    expect(typeof urReader().read(parts[0])).toBe('number');
    expect(() => urReader().read('not a ur')).toThrow(/Keystone/);
  });
});

describe('pairing', () => {
  it('reads the first account from the crypto-hdkey a Keystone shows for MetaMask', () => {
    const root = HDKey.fromMasterSeed(mnemonicToSeedSync(MNEMONIC));
    const node = root.derive("m/44'/60'/0'");
    const hdKey = new CryptoHDKey({
      isMaster: false,
      key: Buffer.from(node.publicKey!),
      chainCode: Buffer.from(node.chainCode!),
      origin: new CryptoKeypath(
        [44, 60, 0].map((index) => new PathComponent({ index, hardened: true })),
        Buffer.from('a1b2c3d4', 'hex')
      ),
    });

    expect(readAccountUr(hdKey.toUR())).toEqual({
      address: ACCOUNT.address,
      path: "m/44'/60'/0'/0/0",
      xfp: 'a1b2c3d4',
    });
  });

  it('says which screen to open when the QR is something else', () => {
    expect(() => readAccountUr(new UR(Buffer.alloc(4), 'bytes'))).toThrow(/MetaMask/);
  });
});

describe('keystoneSigner', () => {
  const signature = Buffer.concat([Buffer.alloc(32, 1), Buffer.alloc(32, 2), Buffer.from([1])]);

  it('asks for a personal message and reads the 65-byte answer', async () => {
    const { exchange, seen } = answering(signature);
    const result = await keystoneSigner(ACCOUNT, exchange).signMessage('p', new Uint8Array([7]));
    expect(result).toBe(`0x${signature.toString('hex')}`);
    expect(seen[0].getDataType()).toBe(DataType.personalMessage);
  });

  it('sends a typed transaction as such and a legacy one under EIP-155', async () => {
    const { exchange, seen } = answering(signature);
    const signer = keystoneSigner(ACCOUNT, exchange);
    const eip1559 = await signer.signTransaction('p', {
      chainId: 8453,
      to: ACCOUNT.address,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
    });
    await signer.signTransaction('p', {
      chainId: 1,
      to: ACCOUNT.address,
      gasPrice: 1n,
      type: 'legacy',
    });

    expect(eip1559.yParity).toBe(1);
    expect(seen.map((request) => request.getDataType())).toEqual([
      DataType.typedTransaction,
      DataType.transaction,
    ]);
  });

  it('sends EIP-712 data as the JSON a Keystone shows', async () => {
    const { exchange, seen } = answering(signature);
    await keystoneSigner(ACCOUNT, exchange).signTypedData('p', {
      domain: { name: 'Test', chainId: 1 },
      types: { Mail: [{ name: 'body', type: 'string' }] },
      primaryType: 'Mail',
      message: { body: 'hi' },
    });
    expect(seen[0].getDataType()).toBe(DataType.typedData);
    expect(JSON.parse(seen[0].getSignData().toString('utf8')).primaryType).toBe('Mail');
  });

  it('passes a walk-away on and rejects a QR that is not a signature', async () => {
    const cancelled = keystoneSigner(ACCOUNT, async () => {
      throw new Error('Cancelled.');
    });
    await expect(cancelled.signMessage('p', new Uint8Array([1]))).rejects.toThrow(/Cancelled/);

    const garbled = keystoneSigner(ACCOUNT, async () => new UR(Buffer.alloc(4), 'bytes'));
    await expect(garbled.signMessage('p', new Uint8Array([1]))).rejects.toThrow();
  });

  it('knows the address without asking, because it cannot ask', async () => {
    expect(await keystoneSigner(ACCOUNT, jest.fn()).getAddress('p')).toBe(ACCOUNT.address);
  });
});

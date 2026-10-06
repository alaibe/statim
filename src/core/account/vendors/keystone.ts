import { UR, UREncoder, URDecoder } from '@ngraveio/bc-ur';
import { secp256k1 } from '@noble/curves/secp256k1';
import * as Crypto from 'expo-crypto';
import {
  bytesToHex,
  serializeTransaction,
  type Address,
  type Hex,
  type TransactionSerializable,
} from 'viem';
import { HDKey, publicKeyToAddress } from 'viem/accounts';

import { toHex } from '@/lib/bytes';

import { askToExchange } from '../device-prompt';
import { parityOf, registerVendor, typedDataJson, type HardwareSigner } from '../hardware';

function registry(): typeof import('@keystonehq/bc-ur-registry-eth') {
  // `require`, not `import()`: both defer evaluation, but `import()` needs ESM
  // support Jest does not have, so this way the deferral stays testable.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@keystonehq/bc-ur-registry-eth');
}

export type QrPurpose = 'message' | 'transaction' | 'typedData';

/** Shows `parts` as an animated QR code and resolves with the frames scanned back. */
export type QrExchange = (request: { parts: string[]; purpose: QrPurpose }) => Promise<string[]>;

export function encodeUr(ur: UR, maxFragment = 200): string[] {
  const encoder = new UREncoder(ur, maxFragment);
  const parts: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 256; i += 1) {
    const part = encoder.nextPart();
    if (seen.has(part)) break;
    seen.add(part);
    parts.push(part);
  }
  return parts;
}

export function decodeUr(frames: string[]): UR | null {
  const decoder = new URDecoder();
  for (const frame of frames) {
    try {
      decoder.receivePart(frame.toLowerCase());
    } catch {
      return null;
    }
  }
  return decoder.isComplete() && decoder.isSuccess() ? decoder.resultUR() : null;
}

export interface KeystoneAccount {
  address: Address;
  path: string;
  xfp: string;
}

/** The first account of the `crypto-hdkey` a Keystone shows under Connect Software Wallet › MetaMask. */
export function readAccountUr(ur: UR): KeystoneAccount {
  if (ur.type !== 'crypto-hdkey') {
    throw new Error('On the Keystone, choose Connect Software Wallet, then MetaMask.');
  }
  const { CryptoHDKey } = registry();
  const hdKey = CryptoHDKey.fromCBOR(ur.cbor);
  const origin = hdKey.getOrigin();
  const node = new HDKey({
    publicKey: new Uint8Array(hdKey.getKey()),
    chainCode: new Uint8Array(hdKey.getChainCode()),
  })
    .deriveChild(0)
    .deriveChild(0);
  if (!node.publicKey) throw new Error('That QR did not contain an account.');
  const uncompressed = secp256k1.ProjectivePoint.fromHex(node.publicKey).toRawBytes(false);

  return {
    address: publicKeyToAddress(bytesToHex(uncompressed)),
    path: `m/${origin.getPath()}/0/0`,
    xfp: Buffer.from(origin.getSourceFingerprint() ?? []).toString('hex'),
  };
}

function readSignature(ur: UR): Buffer {
  const { ETHSignature } = registry();
  const signature = Buffer.from(ETHSignature.fromCBOR(ur.cbor).getSignature());
  if (signature.length !== 65) throw new Error('That QR was not a complete signature.');
  return signature;
}

function requestId(): string {
  const bytes = Crypto.getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = toHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isLegacy(transaction: TransactionSerializable): boolean {
  return transaction.type === 'legacy' || (!transaction.type && 'gasPrice' in transaction);
}

export function keystoneSigner(account: KeystoneAccount, exchange: QrExchange): HardwareSigner {
  const ask = async (
    payload: Buffer,
    type: 'personalMessage' | 'transaction' | 'typedTransaction' | 'typedData',
    purpose: QrPurpose,
    chainId?: number
  ): Promise<Buffer> => {
    const { DataType, EthSignRequest } = registry();
    const request = EthSignRequest.constructETHRequest(
      payload,
      DataType[type],
      account.path,
      account.xfp,
      requestId(),
      chainId,
      account.address
    );
    const ur = decodeUr(await exchange({ parts: encodeUr(request.toUR()), purpose }));
    if (!ur) throw new Error('That QR was not a complete signature.');
    return readSignature(ur);
  };

  return {
    label: 'Keystone',

    async getAddress() {
      return account.address;
    },

    async signMessage(_path, message) {
      return `0x${(await ask(Buffer.from(message), 'personalMessage', 'message')).toString('hex')}` as Hex;
    },

    async signTransaction(_path, transaction) {
      const unsigned = Buffer.from(serializeTransaction(transaction).slice(2), 'hex');
      const signature = await ask(
        unsigned,
        isLegacy(transaction) ? 'transaction' : 'typedTransaction',
        'transaction',
        transaction.chainId
      );
      return {
        r: `0x${signature.subarray(0, 32).toString('hex')}` as Hex,
        s: `0x${signature.subarray(32, 64).toString('hex')}` as Hex,
        yParity: parityOf(signature[64], transaction),
      };
    },

    async signTypedData(_path, typedData) {
      const json = Buffer.from(typedDataJson(typedData), 'utf8');
      return `0x${(await ask(json, 'typedData', 'typedData')).toString('hex')}` as Hex;
    },
  };
}

export function registerKeystone(): void {
  registerVendor({
    id: 'keystone',
    label: 'Keystone',
    connection: 'qr',
    open: (key) =>
      keystoneSigner({ address: key.address, path: key.path, xfp: key.xfp ?? '' }, (request) =>
        askToExchange('Keystone', request)
      ),
  });
}

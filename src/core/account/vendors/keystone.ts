import type { UR } from '@ngraveio/bc-ur';
import { secp256k1 } from '@noble/curves/secp256k1';
import * as Crypto from 'expo-crypto';
import { bytesToHex, serializeTransaction, type TransactionSerializable } from 'viem';
import { HDKey, publicKeyToAddress } from 'viem/accounts';

import { toHex } from '@/lib/bytes';

import { askToExchange, type QrPurpose } from '../device-prompt';
import {
  deviceSignature,
  registerVendor,
  typedDataForDevice,
  type HardwareKey,
  type HardwareSigner,
  type HardwareVendor,
} from '../hardware';

// `require`, not `import()`: both defer evaluation, but `import()` needs ESM
// support Jest does not have, so this way the deferral stays testable.
function registry(): typeof import('@keystonehq/bc-ur-registry-eth') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@keystonehq/bc-ur-registry-eth');
}

function bcUr(): typeof import('@ngraveio/bc-ur') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@ngraveio/bc-ur');
}

/** The frames that show `ur`: a loop of several when it does not fit in one QR code. */
export function encodeUr(ur: UR, maxFragment = 200): string[] {
  const encoder = new (bcUr().UREncoder)(ur, maxFragment);
  const count = encoder.fragmentsLength === 1 ? 1 : encoder.fragmentsLength * 3;
  return Array.from({ length: count }, () => encoder.nextPart());
}

/** Reads a UR one scanned frame at a time; `read` gives the UR once whole, else how far along. */
export function urReader(): { read(frame: string): UR | number } {
  const decoder = new (bcUr().URDecoder)();
  return {
    read(frame) {
      try {
        decoder.receivePart(frame.toLowerCase());
      } catch {
        throw new Error('That QR code is not one a Keystone shows.');
      }
      if (decoder.isError()) throw new Error(decoder.resultError());
      return decoder.isComplete() ? decoder.resultUR() : decoder.estimatedPercentComplete();
    },
  };
}

/** The first account of the `crypto-hdkey` a Keystone shows under Connect Software Wallet › MetaMask. */
export function readAccountUr(ur: UR): HardwareKey {
  if (ur.type !== 'crypto-hdkey') {
    throw new Error('On the Keystone, choose Connect Software Wallet, then MetaMask.');
  }
  const hdKey = registry().CryptoHDKey.fromCBOR(ur.cbor);
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
    xfp: toHex(origin.getSourceFingerprint() ?? new Uint8Array()),
  };
}

const PURPOSE = {
  personalMessage: 'message',
  transaction: 'transaction',
  typedTransaction: 'transaction',
  typedData: 'typedData',
} as const satisfies Record<string, QrPurpose>;

export function keystoneSigner(
  key: HardwareKey,
  exchange: (request: { parts: string[]; purpose: QrPurpose }) => Promise<UR>
): HardwareSigner {
  const ask = async (
    payload: Buffer,
    type: keyof typeof PURPOSE,
    chainId?: number
  ): Promise<Uint8Array> => {
    const { DataType, EthSignRequest, ETHSignature } = registry();
    const request = EthSignRequest.constructETHRequest(
      payload,
      DataType[type],
      key.path,
      key.xfp ?? '',
      Crypto.randomUUID(),
      chainId,
      key.address
    );
    const answer = await exchange({ parts: encodeUr(request.toUR()), purpose: PURPOSE[type] });
    const signature = new Uint8Array(ETHSignature.fromCBOR(answer.cbor).getSignature());
    if (signature.length !== 65) throw new Error('That QR was not a complete signature.');
    return signature;
  };

  return {
    async getAddress() {
      return key.address;
    },

    async signMessage(_path, message) {
      return bytesToHex(await ask(Buffer.from(message), 'personalMessage'));
    },

    async signTransaction(_path, transaction: TransactionSerializable) {
      const legacy =
        transaction.type === 'legacy' || (!transaction.type && 'gasPrice' in transaction);
      const unsigned = Buffer.from(serializeTransaction(transaction).slice(2), 'hex');
      const signature = await ask(
        unsigned,
        legacy ? 'transaction' : 'typedTransaction',
        transaction.chainId
      );
      return deviceSignature(
        bytesToHex(signature.subarray(0, 32)),
        bytesToHex(signature.subarray(32, 64)),
        signature[64],
        transaction
      );
    },

    async signTypedData(_path, typedData) {
      const json = Buffer.from(JSON.stringify(typedDataForDevice(typedData)), 'utf8');
      return bytesToHex(await ask(json, 'typedData'));
    },
  };
}

const KEYSTONE: HardwareVendor = {
  id: 'keystone',
  label: 'Keystone',
  connection: 'qr',
  open: (key) => keystoneSigner(key, (request) => askToExchange(KEYSTONE, request)),
};

export function registerKeystone(): void {
  registerVendor(KEYSTONE);
}

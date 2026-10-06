import { serializeSignature, serializeTransaction, type Address } from 'viem';

import { stripHex, toHex } from '@/lib/bytes';

import {
  DeviceAnswer,
  deviceSignature,
  typedDataForDevice,
  typedDataHashes,
  type HardwareSigner,
} from '../hardware';

// Status words carried by @ledgerhq/errors TransportStatusError.
const APP_NOT_OPEN_STATUS = new Set([0x6e00, 0x6511]);
const USER_DENIED_STATUS = 0x6985;
const BLIND_SIGNING_STATUS = 0x6a80;
const UNSUPPORTED_STATUS = new Set([0x6d00, 0x6e00, 0x6a80]);

/** The Ethereum app protocol from `@ledgerhq/hw-app-eth`, whatever carries it. */
export interface AppEth {
  getAddress(path: string, display?: boolean): Promise<{ address: string }>;
  signPersonalMessage(path: string, hex: string): Promise<{ v: number; r: string; s: string }>;
  signTransaction(
    path: string,
    rawTxHex: string,
    resolution?: null
  ): Promise<{ v: string; r: string; s: string }>;
  signEIP712Message(path: string, message: object): Promise<{ v: number; r: string; s: string }>;
  signEIP712HashedMessage(
    path: string,
    domainHex: string,
    structHex: string
  ): Promise<{ v: number; r: string; s: string }>;
}

function statusOf(error: unknown): number | undefined {
  return (error as { statusCode?: number } | null)?.statusCode;
}

function explain(error: unknown): never {
  const status = statusOf(error);
  const message = error instanceof Error ? error.message : String(error);
  if (status !== undefined && APP_NOT_OPEN_STATUS.has(status)) {
    throw new DeviceAnswer('Open the Ethereum app on your Ledger, then try again.');
  }
  if (status === USER_DENIED_STATUS || /denied|rejected/i.test(message)) {
    throw new DeviceAnswer('Rejected on the Ledger.');
  }
  if (status === BLIND_SIGNING_STATUS) {
    throw new DeviceAnswer('Turn on Blind signing in the Ethereum app settings on your Ledger.');
  }
  throw error instanceof Error ? error : new Error(message);
}

export function ledgerSigner(eth: AppEth): HardwareSigner {
  return {
    async getAddress(path) {
      const { address } = await eth.getAddress(path, false).catch(explain);
      return address as Address;
    },

    async signMessage(path, message) {
      const { r, s, v } = await eth.signPersonalMessage(path, toHex(message)).catch(explain);
      return serializeSignature(deviceSignature(r, s, v));
    },

    async signTransaction(path, transaction) {
      const unsigned = stripHex(serializeTransaction(transaction));
      const { r, s, v } = await eth.signTransaction(path, unsigned, null).catch(explain);
      return deviceSignature(r, s, v, transaction);
    },

    async signTypedData(path, typedData) {
      try {
        const { r, s, v } = await eth.signEIP712Message(path, typedDataForDevice(typedData));
        return serializeSignature(deviceSignature(r, s, v));
      } catch (error) {
        const status = statusOf(error);
        if (status === undefined || !UNSUPPORTED_STATUS.has(status)) explain(error);
      }
      const hashes = typedDataHashes(typedData);
      const { r, s, v } = await eth
        .signEIP712HashedMessage(path, stripHex(hashes.domain), stripHex(hashes.message))
        .catch(explain);
      return serializeSignature(deviceSignature(r, s, v));
    },
  };
}

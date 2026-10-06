import { bytesToHex, serializeTransaction, type Address, type Hex } from 'viem';

import { stripHex } from '@/lib/bytes';

import {
  parityOf,
  typedDataHashes,
  typedDataJson,
  type HardwareSigner,
  type TypedData,
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

const word = (hex: string) => `0x${stripHex(hex).padStart(64, '0')}` as Hex;

function toSignature(r: string, s: string, v: number | string): Hex {
  const parity = typeof v === 'number' ? v : parseInt(v, 16);
  const normalised = parity < 27 ? parity + 27 : parity;
  return `0x${stripHex(word(r))}${stripHex(word(s))}${normalised.toString(16).padStart(2, '0')}` as Hex;
}

function statusOf(error: unknown): number | undefined {
  return (error as { statusCode?: number } | null)?.statusCode;
}

function explain(error: unknown): never {
  const status = statusOf(error);
  const message = error instanceof Error ? error.message : String(error);
  if (status !== undefined && APP_NOT_OPEN_STATUS.has(status)) {
    throw new Error('Open the Ethereum app on your Ledger, then try again.');
  }
  if (status === USER_DENIED_STATUS || /denied|rejected/i.test(message)) {
    throw new Error('Rejected on the Ledger.');
  }
  if (status === BLIND_SIGNING_STATUS) {
    throw new Error('Turn on Blind signing in the Ethereum app settings on your Ledger.');
  }
  throw error instanceof Error ? error : new Error(message);
}

export function ledgerSigner(eth: AppEth): HardwareSigner {
  return {
    label: 'Ledger',

    async getAddress(path) {
      const { address } = await eth.getAddress(path, false).catch(explain);
      return address as Address;
    },

    async signMessage(path, message) {
      const { r, s, v } = await eth
        .signPersonalMessage(path, stripHex(bytesToHex(message)))
        .catch(explain);
      return toSignature(r, s, v);
    },

    async signTransaction(path, transaction) {
      const unsigned = serializeTransaction(transaction);
      const { r, s, v } = await eth.signTransaction(path, stripHex(unsigned), null).catch(explain);
      return { r: word(r), s: word(s), yParity: parityOf(parseInt(v, 16), transaction) };
    },

    async signTypedData(path, typedData: TypedData) {
      try {
        const { r, s, v } = await eth.signEIP712Message(path, JSON.parse(typedDataJson(typedData)));
        return toSignature(r, s, v);
      } catch (error) {
        const status = statusOf(error);
        if (status === undefined || !UNSUPPORTED_STATUS.has(status)) explain(error);
      }
      const hashes = typedDataHashes(typedData);
      const { r, s, v } = await eth
        .signEIP712HashedMessage(path, stripHex(hashes.domain), stripHex(hashes.message))
        .catch(explain);
      return toSignature(r, s, v);
    },
  };
}

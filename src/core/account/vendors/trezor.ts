import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { toHex as quantity, type Address, type Hex, type TransactionSerializable } from 'viem';

import { stripHex, toHex } from '@/lib/bytes';
import { openExternal } from '@/lib/open-url';

import { Cancelled } from '../device-prompt';
import {
  DeviceAnswer,
  deviceSignature,
  registerVendor,
  typedDataForDevice,
  typedDataHashes,
  type HardwareSigner,
} from '../hardware';

/** Trezor Connect's deep link, as `@trezor/connect-mobile` 10 builds it; Trezor Suite answers it. */
const CONNECT = 'https://connect.trezor.io/10/deeplink/1/';

type Payload = Record<string, unknown>;

const pending = new Map<string, { resolve(payload: Payload): void; reject(error: Error): void }>();

const queryOf = (url: string) => new URLSearchParams(url.slice(url.indexOf('?') + 1));

export function isTrezorCallback(url: string): boolean {
  return /^[a-z+.-]+:\/\/+trezor\b/i.test(url) && url.includes('?') && queryOf(url).has('id');
}

/** Settles the request a Trezor Suite answer is for. */
export function handleTrezorCallback(url: string): void {
  const query = queryOf(url);
  const id = query.get('id') ?? '';
  const waiting = pending.get(id);
  if (!waiting) return;
  pending.delete(id);

  let answer: { success?: boolean; payload?: Payload } | null = null;
  try {
    answer = JSON.parse(query.get('response') ?? 'null');
  } catch {}
  if (!answer?.payload) {
    waiting.reject(new Error('Trezor Suite answered with nothing Statim can read.'));
  } else if (!answer.success) {
    const error = answer.payload.error;
    waiting.reject(
      new DeviceAnswer(typeof error === 'string' ? error : 'Cancelled on the Trezor.')
    );
  } else {
    waiting.resolve(answer.payload);
  }
}

function cancelPending(): void {
  for (const waiting of pending.values()) waiting.reject(new Cancelled());
  pending.clear();
}

async function call(method: string, params: Payload): Promise<Payload> {
  const id = Crypto.randomUUID();
  const query = new URLSearchParams({
    method,
    params: JSON.stringify(params),
    callback: `${Linking.createURL('trezor')}?id=${id}`,
    appName: 'Statim',
  });
  const answer = new Promise<Payload>((resolve, reject) => pending.set(id, { resolve, reject }));
  try {
    await openExternal(`${CONNECT}?${query}`);
  } catch {
    pending.delete(id);
    throw new Error('Install Trezor Suite on this phone to use your Trezor here.');
  }
  return answer;
}

function signatureOf(payload: Payload): Hex {
  if (typeof payload.signature !== 'string') {
    throw new Error('Trezor Suite returned no signature.');
  }
  return `0x${stripHex(payload.signature)}`;
}

function transactionFor(transaction: TransactionSerializable) {
  const hex = (value: bigint | number | undefined) =>
    value === undefined ? undefined : quantity(value);
  return {
    to: transaction.to ?? undefined,
    value: hex(transaction.value ?? 0n),
    data: transaction.data ?? '0x',
    chainId: transaction.chainId,
    nonce: hex(transaction.nonce ?? 0),
    gasLimit: hex(transaction.gas),
    ...('gasPrice' in transaction && transaction.gasPrice !== undefined
      ? { gasPrice: hex(transaction.gasPrice) }
      : {
          maxFeePerGas: hex(transaction.maxFeePerGas),
          maxPriorityFeePerGas: hex(transaction.maxPriorityFeePerGas),
        }),
  };
}

function trezorSigner(): HardwareSigner {
  return {
    async getAddress(path) {
      const payload = await call('ethereumGetAddress', { path, showOnTrezor: false });
      if (typeof payload.address !== 'string') throw new Error('Trezor Suite returned no address.');
      return payload.address as Address;
    },

    async signMessage(path, message) {
      return signatureOf(
        await call('ethereumSignMessage', { path, message: toHex(message), hex: true })
      );
    },

    async signTransaction(path, transaction) {
      const payload = await call('ethereumSignTransaction', {
        path,
        transaction: transactionFor(transaction),
      });
      const { r, s, v } = payload as { r?: string; s?: string; v?: string };
      if (!r || !s || !v) throw new Error('Trezor Suite returned no signature.');
      return deviceSignature(r, s, v, transaction);
    },

    async signTypedData(path, typedData) {
      const hashes = typedDataHashes(typedData);
      return signatureOf(
        await call('ethereumSignTypedData', {
          path,
          data: typedDataForDevice(typedData),
          metamask_v4_compat: true,
          domain_separator_hash: stripHex(hashes.domain),
          message_hash: stripHex(hashes.message),
        })
      );
    },
  };
}

export function registerTrezor(): void {
  registerVendor({
    id: 'trezor',
    label: 'Trezor',
    connection: 'companion-app',
    open: trezorSigner,
    cancel: cancelPending,
  });
}

import * as Linking from 'expo-linking';
import { bytesToHex, toHex, type Address, type Hex, type TransactionSerializable } from 'viem';

import { stripHex } from '@/lib/bytes';

import { Cancelled } from '../device-prompt';
import { openExternal } from '@/lib/open-url';

import {
  parityOf,
  registerVendor,
  typedDataHashes,
  typedDataJson,
  type HardwareSigner,
} from '../hardware';

/** Trezor Connect's deep link, as `@trezor/connect-mobile` 10 builds it; Trezor Suite answers it. */
const CONNECT = 'https://connect.trezor.io/10/deeplink/1/';

interface Answer {
  success: boolean;
  payload: Record<string, unknown>;
}

const pending = new Map<string, { resolve(answer: Answer): void; reject(error: Error): void }>();

// `new URL` is unreliable for custom schemes across engines, and `Linking.parse` would need
// a native module in tests.
function queryOf(url: string): Map<string, string> {
  const out = new Map<string, string>();
  const at = url.indexOf('?');
  if (at === -1) return out;
  for (const pair of url.slice(at + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const decode = (text: string) => decodeURIComponent(text.replace(/\+/g, ' '));
    out.set(decode(pair.slice(0, eq)), decode(pair.slice(eq + 1)));
  }
  return out;
}

export function isTrezorCallback(url: string): boolean {
  return /^[a-z+.-]+:\/\/+trezor\b/i.test(url) && queryOf(url).has('id');
}

/** Settles the request a Trezor Suite answer is for; false when it is not one. */
export function handleTrezorCallback(url: string): boolean {
  const query = queryOf(url);
  const id = query.get('id');
  const waiting = id ? pending.get(id) : undefined;
  if (!id || !waiting) return false;
  pending.delete(id);

  let answer: Answer | null = null;
  try {
    answer = JSON.parse(query.get('response') ?? 'null') as Answer | null;
  } catch {}
  if (!answer) {
    waiting.reject(new Error('Trezor Suite answered with nothing Statim can read.'));
  } else if (!answer.success) {
    const error = answer.payload?.error;
    waiting.reject(new Error(typeof error === 'string' ? error : 'Cancelled on the Trezor.'));
  } else {
    waiting.resolve(answer);
  }
  return true;
}

function cancelPending(): void {
  for (const waiting of pending.values()) waiting.reject(new Cancelled());
  pending.clear();
}

function newRequestId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function call(method: string, params: Record<string, unknown>): Promise<Answer['payload']> {
  const id = newRequestId();
  const callback = `${Linking.createURL('trezor')}?id=${encodeURIComponent(id)}`;
  const url =
    `${CONNECT}?method=${method}` +
    `&params=${encodeURIComponent(JSON.stringify(params))}` +
    `&callback=${encodeURIComponent(callback)}` +
    `&appName=Statim`;

  const answer = new Promise<Answer>((resolve, reject) => pending.set(id, { resolve, reject }));
  try {
    await openExternal(url);
  } catch {
    pending.delete(id);
    throw new Error('Install Trezor Suite on this phone to use your Trezor here.');
  }
  return (await answer).payload;
}

function signatureOf(payload: Answer['payload']): Hex {
  const signature = payload.signature;
  if (typeof signature !== 'string') throw new Error('Trezor Suite returned no signature.');
  return `0x${stripHex(signature)}` as Hex;
}

const quantity = (value: bigint | number | undefined) =>
  value === undefined ? undefined : toHex(value);

function transactionFor(transaction: TransactionSerializable) {
  return {
    to: transaction.to ?? undefined,
    value: quantity(transaction.value ?? 0n),
    data: transaction.data ?? '0x',
    chainId: transaction.chainId,
    nonce: quantity(transaction.nonce ?? 0),
    gasLimit: quantity(transaction.gas),
    ...('gasPrice' in transaction && transaction.gasPrice !== undefined
      ? { gasPrice: quantity(transaction.gasPrice) }
      : {
          maxFeePerGas: quantity(transaction.maxFeePerGas),
          maxPriorityFeePerGas: quantity(transaction.maxPriorityFeePerGas),
        }),
  };
}

export function trezorSigner(): HardwareSigner {
  return {
    label: 'Trezor',

    async getAddress(path) {
      const payload = await call('ethereumGetAddress', { path, showOnTrezor: false });
      if (typeof payload.address !== 'string') throw new Error('Trezor Suite returned no address.');
      return payload.address as Address;
    },

    async signMessage(path, message) {
      const payload = await call('ethereumSignMessage', {
        path,
        message: stripHex(bytesToHex(message)),
        hex: true,
      });
      return signatureOf(payload);
    },

    async signTransaction(path, transaction) {
      const payload = await call('ethereumSignTransaction', {
        path,
        transaction: transactionFor(transaction),
      });
      const { r, s, v } = payload as { r?: string; s?: string; v?: string };
      if (!r || !s || !v) throw new Error('Trezor Suite returned no signature.');
      return {
        r: `0x${stripHex(r).padStart(64, '0')}` as Hex,
        s: `0x${stripHex(s).padStart(64, '0')}` as Hex,
        yParity: parityOf(parseInt(stripHex(v), 16), transaction),
      };
    },

    async signTypedData(path, typedData) {
      const hashes = typedDataHashes(typedData);
      const payload = await call('ethereumSignTypedData', {
        path,
        data: JSON.parse(typedDataJson(typedData)),
        metamask_v4_compat: true,
        domain_separator_hash: stripHex(hashes.domain),
        message_hash: stripHex(hashes.message),
      });
      return signatureOf(payload);
    },
  };
}

export function registerTrezor(): void {
  registerVendor({
    id: 'trezor',
    label: 'Trezor',
    connection: 'companion-app',
    open: () => trezorSigner(),
    cancel: cancelPending,
  });
}

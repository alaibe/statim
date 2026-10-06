import type { Hex } from 'viem';

import type { AccountRecord } from './accounts';
import { askToConnect, Cancelled, showConfirming } from './device-prompt';
import {
  DEFAULT_EVM_PATH,
  findVendor,
  vendor,
  type HardwareKey,
  type HardwareSigner,
} from './hardware';

const live = new Map<string, HardwareSigner>();
let queue: Promise<unknown> = Promise.resolve();

/** Errors after which the wallet is still connected and ready for another try. */
const STILL_CONNECTED = /Rejected on|Open the Ethereum app|Blind signing|Cancelled/;

export function keyOf(record: AccountRecord): HardwareKey {
  return { address: record.address, path: record.path ?? DEFAULT_EVM_PATH, xfp: record.xfp };
}

export function holdDevice(accountId: string, signer: HardwareSigner): void {
  live.set(accountId, signer);
}

export function releaseDevice(accountId: string): void {
  live.delete(accountId);
}

async function holds(signer: HardwareSigner, key: HardwareKey): Promise<boolean> {
  return (await signer.getAddress(key.path)).toLowerCase() === key.address.toLowerCase();
}

async function signerFor(record: AccountRecord): Promise<HardwareSigner> {
  const held = live.get(record.id);
  if (held) return held;

  const found = vendor(record.vendorId ?? '');
  const key = keyOf(record);
  let signer: HardwareSigner | null = found.open?.(key) ?? null;
  if (!signer && found.connect && record.device) {
    signer = await found
      .connect(record.device)
      .then(async (candidate) => ((await holds(candidate, key)) ? candidate : null))
      .catch(() => null);
  }
  signer ??= await askToConnect({
    vendorId: found.id,
    label: found.label,
    address: key.address,
    path: key.path,
  });
  live.set(record.id, signer);
  return signer;
}

/** Runs one request on the account's wallet, connecting it first, one request at a time. */
function onDevice<T>(
  record: AccountRecord,
  task: (signer: HardwareSigner) => Promise<T>
): Promise<T> {
  const attempt = async (retried: boolean): Promise<T> => {
    const signer = await signerFor(record);
    const { connection, cancel } = vendor(record.vendorId ?? '');
    const done =
      connection === 'qr'
        ? () => {}
        : showConfirming(signer.label, connection === 'companion-app', cancel);
    try {
      return await task(signer);
    } catch (error) {
      if (error instanceof Cancelled) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (STILL_CONNECTED.test(message)) throw error;
      live.delete(record.id);
      if (retried || connection === 'qr' || connection === 'companion-app') throw error;
      return await attempt(true);
    } finally {
      done();
    }
  };
  const turn = queue.then(() => attempt(false));
  queue = turn.catch(() => {});
  return turn;
}

/** The account's wallet as a signer that connects when it is first needed. */
export function deviceSigner(record: AccountRecord): HardwareSigner {
  return {
    label: findVendor(record.vendorId)?.label ?? record.label,
    getAddress: (path) => onDevice(record, (signer) => signer.getAddress(path)),
    signMessage: (path, message): Promise<Hex> =>
      onDevice(record, (signer) => signer.signMessage(path, message)),
    signTransaction: (path, transaction) =>
      onDevice(record, (signer) => signer.signTransaction(path, transaction)),
    signTypedData: (path, typedData) =>
      onDevice(record, (signer) => signer.signTypedData(path, typedData)),
  };
}

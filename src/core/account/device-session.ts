import type { AccountRecord } from './accounts';
import { askToConnect, Cancelled, showConfirming, type LinkedVendor } from './device-prompt';
import {
  DEFAULT_EVM_PATH,
  DeviceAnswer,
  vendor,
  type HardwareKey,
  type HardwareSigner,
  type HardwareVendor,
} from './hardware';

const live = new Map<string, HardwareSigner>();
let queue: Promise<unknown> = Promise.resolve();

export function keyOf(record: AccountRecord): HardwareKey {
  return { address: record.address, path: record.path ?? DEFAULT_EVM_PATH, xfp: record.xfp };
}

export function holdDevice(accountId: string, signer: HardwareSigner): void {
  live.set(accountId, signer);
}

export function releaseDevice(accountId: string): void {
  live.delete(accountId);
}

/** Connects to `deviceId` and makes sure it holds the account. */
export async function connectTo(
  wallet: LinkedVendor,
  deviceId: string,
  key: HardwareKey
): Promise<HardwareSigner> {
  const signer = await wallet.connect(deviceId);
  if ((await signer.getAddress(key.path)).toLowerCase() !== key.address.toLowerCase()) {
    throw new Error(`That ${wallet.label} holds a different account.`);
  }
  return signer;
}

async function signerFor(record: AccountRecord, wallet: HardwareVendor): Promise<HardwareSigner> {
  const held = live.get(record.id);
  if (held) return held;

  const key = keyOf(record);
  let signer: HardwareSigner | null;
  if (wallet.connection === 'qr') signer = wallet.open(key);
  else if (wallet.connection === 'companion-app') signer = wallet.open();
  else {
    signer = record.device ? await connectTo(wallet, record.device, key).catch(() => null) : null;
    signer ??= await askToConnect(wallet, key);
  }
  live.set(record.id, signer);
  return signer;
}

/** Runs one request on the account's wallet, connecting it first, one request at a time. */
function onDevice<T>(
  record: AccountRecord,
  task: (signer: HardwareSigner) => Promise<T>
): Promise<T> {
  const attempt = async (retried: boolean): Promise<T> => {
    const wallet = vendor(record.vendorId ?? '');
    const signer = await signerFor(record, wallet);
    const done = wallet.connection === 'qr' ? () => {} : showConfirming(wallet);
    try {
      return await task(signer);
    } catch (error) {
      if (error instanceof Cancelled || error instanceof DeviceAnswer) throw error;
      live.delete(record.id);
      if (retried || wallet.connection === 'qr' || wallet.connection === 'companion-app') {
        throw error;
      }
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
    getAddress: (path) => onDevice(record, (signer) => signer.getAddress(path)),
    signMessage: (path, message) => onDevice(record, (signer) => signer.signMessage(path, message)),
    signTransaction: (path, transaction) =>
      onDevice(record, (signer) => signer.signTransaction(path, transaction)),
    signTypedData: (path, typedData) =>
      onDevice(record, (signer) => signer.signTypedData(path, typedData)),
  };
}

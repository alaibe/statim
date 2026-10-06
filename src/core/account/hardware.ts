import {
  getTypesForEIP712Domain,
  hashDomain,
  hashStruct,
  hexToBytes,
  pad,
  serializeTransaction,
  stringify,
  stringToBytes,
  type Address,
  type CustomSource,
  type Hex,
  type LocalAccount,
  type Signature,
  type SignableMessage,
  type TransactionSerializable,
  type TypedDataDefinition,
} from 'viem';
import { toAccount } from 'viem/accounts';

export interface HardwareSigner {
  getAddress(path: string): Promise<Address>;
  /** EIP-191 personal_sign of `message`; a 65-byte signature with v of 27 or 28. */
  signMessage(path: string, message: Uint8Array): Promise<Hex>;
  signTransaction(path: string, transaction: TransactionSerializable): Promise<Signature>;
  signTypedData(path: string, typedData: TypedData): Promise<Hex>;
}

export type TypedData = TypedDataDefinition & { primaryType: string };

/** Where an account lives on its wallet. `xfp` is the master fingerprint a Keystone asks for. */
export interface HardwareKey {
  address: Address;
  path: string;
  xfp?: string;
}

export type HardwareVendor = { id: string; label: string } & (
  | {
      connection: 'bluetooth' | 'usb';
      scan(
        onFound: (device: { id: string; name: string }) => void,
        onError: (e: unknown) => void
      ): Promise<() => void>;
      connect(deviceId: string): Promise<HardwareSigner>;
    }
  | { connection: 'qr'; open(key: HardwareKey): HardwareSigner }
  | { connection: 'companion-app'; open(): HardwareSigner; cancel(): void }
);

export type HardwareConnection = HardwareVendor['connection'];

/** The wallet answered: it refused, or it needs something done on it. The link is still up. */
export class DeviceAnswer extends Error {}

const vendors = new Map<string, HardwareVendor>();

export function registerVendor(vendor: HardwareVendor): void {
  vendors.set(vendor.id, vendor);
}

export function hardwareVendors(): HardwareVendor[] {
  return [...vendors.values()];
}

export function vendor(id: string): HardwareVendor {
  const found = vendors.get(id);
  if (!found) throw new Error(`No hardware wallet called "${id}" is available here.`);
  return found;
}

export const DEFAULT_EVM_PATH = "m/44'/60'/0'/0/0";

function messageBytes(message: SignableMessage): Uint8Array {
  if (typeof message === 'string') return stringToBytes(message);
  return typeof message.raw === 'string' ? hexToBytes(message.raw) : message.raw;
}

/** The y parity behind a device's v, which a Ledger truncates to one byte for EIP-155. */
export function parityOf(v: number, transaction: Pick<TransactionSerializable, 'chainId'>): number {
  if (v === 0 || v === 1) return v;
  if (v === 27 || v === 28) return v - 27;
  return ((((v - 35 - 2 * (transaction.chainId ?? 0)) % 256) + 256) % 256) & 1;
}

/** A device's r, s and v as viem wants them, however the device wrote v. */
export function deviceSignature(
  r: string,
  s: string,
  v: number | string,
  transaction: Pick<TransactionSerializable, 'chainId'> = {}
): Signature {
  const word = (hex: string) => pad(`0x${hex.replace(/^0x/, '')}` as Hex);
  const yParity = parityOf(typeof v === 'number' ? v : parseInt(v, 16), transaction);
  // viem's legacy serializer works out EIP-155's v from this one.
  return { r: word(r), s: word(s), v: BigInt(27 + yParity), yParity };
}

function withDomainType(typedData: TypedData) {
  return {
    EIP712Domain: getTypesForEIP712Domain({ domain: typedData.domain }),
    ...typedData.types,
  };
}

/** EIP-712 data with its domain type spelled out, as devices want it, and bigints as text. */
export function typedDataForDevice(typedData: TypedData): Record<string, unknown> {
  return JSON.parse(stringify({ ...typedData, types: withDomainType(typedData) }));
}

export function typedDataHashes(typedData: TypedData): { domain: Hex; message: Hex } {
  const types = withDomainType(typedData) as never;
  return {
    domain: hashDomain({ domain: typedData.domain ?? {}, types } as never),
    message: hashStruct({
      data: typedData.message,
      primaryType: typedData.primaryType,
      types,
    } as never),
  };
}

export function hardwareAccount(
  signer: HardwareSigner,
  address: Address,
  path: string = DEFAULT_EVM_PATH
): LocalAccount {
  const source: CustomSource = {
    address,
    signMessage: ({ message }) => signer.signMessage(path, messageBytes(message)),
    async signTransaction(transaction, options) {
      const signature = await signer.signTransaction(path, transaction);
      return (options?.serializer ?? serializeTransaction)(transaction, signature);
    },
    signTypedData: (typedData) => signer.signTypedData(path, typedData as TypedData),
  };
  return toAccount(source);
}

import {
  getTypesForEIP712Domain,
  hashDomain,
  hashStruct,
  hexToBytes,
  serializeTransaction,
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
  readonly label: string;
  getAddress(path: string): Promise<Address>;
  /** EIP-191 personal_sign of `message`; a 65-byte signature with v of 27 or 28. */
  signMessage(path: string, message: Uint8Array): Promise<Hex>;
  signTransaction(path: string, transaction: TransactionSerializable): Promise<Signature>;
  signTypedData(path: string, typedData: TypedData): Promise<Hex>;
}

export type TypedData = TypedDataDefinition & { primaryType: string };

export type HardwareConnection = 'bluetooth' | 'usb' | 'qr' | 'companion-app';

/** Where an account lives on its wallet. `xfp` is the master fingerprint a Keystone asks for. */
export interface HardwareKey {
  address: Address;
  path: string;
  xfp?: string;
}

export interface HardwareVendor {
  id: string;
  label: string;
  connection: HardwareConnection;
  /** For wallets on a link: finds them, then `connect` opens one. */
  scan?(
    onFound: (device: { id: string; name: string }) => void,
    onError: (e: unknown) => void
  ): Promise<() => void>;
  connect?(deviceId: string): Promise<HardwareSigner>;
  /** For wallets reached another way each time, by QR codes or through their own app. */
  open?(key: HardwareKey): HardwareSigner;
  /** Gives up on the request its app was opened for, when the person does not come back. */
  cancel?(): void;
}

const vendors = new Map<string, HardwareVendor>();

export function registerVendor(vendor: HardwareVendor): void {
  vendors.set(vendor.id, vendor);
}

export function hardwareVendors(): HardwareVendor[] {
  return [...vendors.values()];
}

export function findVendor(id: string | undefined): HardwareVendor | undefined {
  return id ? vendors.get(id) : undefined;
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

/** EIP-712 data with its domain type spelled out, as devices want it, and bigints as text. */
export function typedDataJson(typedData: TypedData): string {
  const types = {
    EIP712Domain: getTypesForEIP712Domain({ domain: typedData.domain }),
    ...typedData.types,
  };
  return JSON.stringify({ ...typedData, types }, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

export function typedDataHashes(typedData: TypedData): { domain: Hex; message: Hex } {
  const types = {
    EIP712Domain: getTypesForEIP712Domain({ domain: typedData.domain }),
    ...typedData.types,
  } as never;
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

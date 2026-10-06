import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, stringToBytes, type Hex, type LocalAccount } from 'viem';
import { HDKey } from 'viem/accounts';

import { deriveKey, type Keyring } from './keyring';

/**
 * What a hardware wallet signs once per account. Its devices sign
 * deterministically, so the same wallet gives the same seed on every device.
 */
export const CHAT_KEY_MESSAGE =
  'Statim chat keys\n\n' +
  'Sign to create the keys Statim uses for Nostr, Status and notifications with this account. ' +
  'It moves no funds and costs nothing.\n\nVersion 1';

export function chatSeedFrom(signature: Hex): Hex {
  const secret = hkdf(
    sha256,
    hexToBytes(signature),
    stringToBytes('statim'),
    stringToBytes('chat seed v1'),
    64
  );
  return bytesToHex(secret);
}

/** Ethereum signs on the device and chat keys come from the seed; funds keys never do. */
export function hardwareKeyring(account: LocalAccount, seed: Hex | null): Keyring {
  const root = seed ? HDKey.fromMasterSeed(hexToBytes(seed)) : null;
  return {
    kind: 'hardware',
    mnemonic: null,
    account,
    address: account.address,
    chatKey: root ? (path) => deriveKey(root, path) : null,
    wallet: null,
  };
}

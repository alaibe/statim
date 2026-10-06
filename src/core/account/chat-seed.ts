import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, hexToBytes, stringToBytes, type Hex, type LocalAccount } from 'viem';
import { HDKey } from 'viem/accounts';

import type { DerivedKey, Keyring } from './keyring';

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

/** Ethereum signs on the device; only chat keys come from the seed, and funds never do. */
export function hardwareKeyring(account: LocalAccount, seed: Hex | null): Keyring {
  const root = seed ? HDKey.fromMasterSeed(hexToBytes(seed)) : null;
  return {
    kind: 'hardware',
    mnemonic: null,
    account,
    address: account.address,
    derive(path: string): DerivedKey {
      if (!root) throw new Error('Set up chat keys for this account in Settings › Accounts.');
      const node = root.derive(path);
      if (!node.privateKey || !node.publicKey) {
        throw new Error(`Could not derive a key at "${path}"`);
      }
      return { path, privateKey: node.privateKey, publicKey: node.publicKey };
    },
    deriveEd25519(): never {
      throw new Error('Solana needs an account with a recovery phrase.');
    },
  };
}

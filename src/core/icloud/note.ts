import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { utf8ToBytes } from '@noble/hashes/utils';

import { normalizeMnemonic } from '@/core/account/keyring';
import { base64ToBytes, bytesToBase64, concat, toHex } from '@/lib/bytes';
import { randomBytes } from '@/lib/random';

/** What the desktop tells the iPhone about one message, through the user's iCloud. */
export interface Note {
  chat?: string;
  title: string;
  body: string;
}

/**
 * Both devices holding an account derive the same key from its recovery
 * phrase, so they agree without pairing. The tag names the account in iCloud
 * without giving away its address.
 */
export interface NoteKey {
  key: string;
  tag: string;
}

const TITLE_LIMIT = 100;
const BODY_LIMIT = 300;

export function noteKey(mnemonic: string): NoteKey {
  const secret = hkdf(
    sha256,
    utf8ToBytes(normalizeMnemonic(mnemonic)),
    utf8ToBytes('statim'),
    utf8ToBytes('icloud notes v1'),
    40
  );
  return { key: bytesToBase64(secret.slice(0, 32)), tag: toHex(secret.slice(32)) };
}

/** AES-256-GCM, as nonce ‖ ciphertext ‖ tag in base64: CryptoKit's `SealedBox(combined:)`. */
export function sealNote(key: string, note: Note, nonce = randomBytes(12)): string {
  const plaintext = utf8ToBytes(
    JSON.stringify({
      chat: note.chat,
      title: clip(note.title, TITLE_LIMIT),
      body: clip(note.body, BODY_LIMIT),
    })
  );
  return bytesToBase64(concat([nonce, gcm(base64ToBytes(key), nonce).encrypt(plaintext)]));
}

export function openNote(key: string, sealed: string): Note | null {
  try {
    const bytes = base64ToBytes(sealed);
    const plaintext = gcm(base64ToBytes(key), bytes.subarray(0, 12)).decrypt(bytes.subarray(12));
    return JSON.parse(new TextDecoder().decode(plaintext)) as Note;
  } catch {
    return null;
  }
}

function clip(text: string, limit: number): string {
  const characters = Array.from(text);
  return characters.length > limit ? `${characters.slice(0, limit - 1).join('')}…` : text;
}

import { sha256, sha512 } from '@noble/hashes/sha2';

/**
 * What libp2p's browser build needs that Hermes lacks. Of WebCrypto that is only
 * `crypto.subtle.digest`, which multiformats hashes through; for keys the browser
 * code falls back to pure JS.
 */
const signal = AbortSignal.prototype as AbortSignal & { throwIfAborted?: () => void };
if (!signal.throwIfAborted) {
  signal.throwIfAborted = function throwIfAborted(this: AbortSignal) {
    if (this.aborted) throw this.reason ?? new Error('This operation was aborted');
  };
}

type Digest = (
  algorithm: string | { name: string },
  data: ArrayBuffer | ArrayBufferView
) => Promise<ArrayBuffer>;

const webCrypto = globalThis.crypto as unknown as { subtle?: { digest: Digest } };
if (!webCrypto.subtle) {
  const hashes: Record<string, (data: Uint8Array) => Uint8Array> = {
    'SHA-256': sha256,
    'SHA-512': sha512,
  };
  webCrypto.subtle = {
    async digest(algorithm, data) {
      const name = (typeof algorithm === 'string' ? algorithm : algorithm.name).toUpperCase();
      const hash = hashes[name];
      if (!hash) throw new Error(`${name} is not available here`);
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : new Uint8Array(data);
      return hash(bytes).slice().buffer;
    },
  };
}

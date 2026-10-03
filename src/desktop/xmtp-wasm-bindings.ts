/**
 * What `@xmtp/browser-sdk` gets when it imports `@xmtp/wasm-bindings` on web.
 *
 * The bindings locate their binary with `new URL('bindings_wasm_bg.wasm',
 * import.meta.url)`, and Metro has no `import.meta.url` inside a Web Worker.
 * Metro serves the binary as an asset instead, and only the default export
 * changes: it passes the asset's URL through when the SDK calls it bare.
 */
import init from '@xmtp/wasm-bindings';

export * from '@xmtp/wasm-bindings';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WASM_URL = require('@xmtp/wasm-bindings/dist/bindings_wasm_bg.wasm') as string;

export default function initFromAsset(
  moduleOrPath?: Parameters<typeof init>[0]
): ReturnType<typeof init> {
  return init(moduleOrPath ?? { module_or_path: new URL(WASM_URL, self.location.href) });
}

/** Metro has no `import.meta.url` in a Web Worker, so init passes the wasm asset's URL when called bare. */
import init from "@xmtp/wasm-bindings";

export * from "@xmtp/wasm-bindings";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WASM_URL = require("@xmtp/wasm-bindings/dist/bindings_wasm_bg.wasm") as string;

export default function initFromAsset(moduleOrPath?: Parameters<typeof init>[0]): ReturnType<typeof init> {
  return init(moduleOrPath ?? { module_or_path: new URL(WASM_URL, self.location.href) });
}

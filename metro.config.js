const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// WalletConnect, viem and the hardware-wallet SDKs reach for Node core
// modules that React Native does not ship. `stream` is for Keystone's UR
// registry, which needs it through bs58check and create-hash.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve('expo-crypto'),
  stream: require.resolve('readable-stream'),
};

/**
 * `extraNodeModules` only rewrites requests from this project's own files.
 * The ones that matter come from inside `node_modules` (cipher-base asking
 * for `stream`), and those need the resolver itself.
 */
const NODE_SHIMS = {
  stream: require.resolve('readable-stream'),
  crypto: require.resolve('expo-crypto'),
};

/**
 * These ship a `browser` field that points at files their `exports` map does
 * not list. Metro applies the redirect, then warns that the redirected path is
 * not exported, then falls back to that very file. Resolving them without
 * package exports lands on the same file without the warning. Their newer
 * majors, which libp2p uses, have no `main` and resolve only through exports.
 */
const BROWSER_FIELD_OVER_EXPORTS = /^(uint8arrays|multiformats|@noble\/hashes)(\/|$)/;

/**
 * On native, Metro follows Reanimated's `react-native` field to its source, so
 * `createAnimatedComponent` is compiled with NativeWind's JSX runtime and
 * passes `className` on. On web it takes the precompiled `main`, which imports
 * `react/jsx-runtime` directly and drops every `className`.
 */
const INTEROP_JSX_ON_WEB = /\/node_modules\/react-native-reanimated\//;

/** See src/desktop/xmtp-wasm-bindings.ts. */
config.resolver.assetExts.push('wasm');
const XMTP_SDK = /\/node_modules\/@xmtp\/browser-sdk\//;
const XMTP_WASM_BINDINGS_ON_WEB = require.resolve('./src/desktop/xmtp-wasm-bindings.ts');
const XMTP_WASM = '@xmtp/wasm-bindings/dist/bindings_wasm_bg.wasm';
const XMTP_WASM_FILE = path.join(
  path.dirname(require.resolve('@xmtp/wasm-bindings')),
  'bindings_wasm_bg.wasm'
);

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = NODE_SHIMS[moduleName];
  if (shim) return { type: 'sourceFile', filePath: shim };
  if (moduleName === XMTP_WASM) return { type: 'assetFiles', filePaths: [XMTP_WASM_FILE] };
  if (
    platform === 'web' &&
    moduleName === '@xmtp/wasm-bindings' &&
    XMTP_SDK.test(context.originModulePath)
  ) {
    return { type: 'sourceFile', filePath: XMTP_WASM_BINDINGS_ON_WEB };
  }
  if (
    platform === 'web' &&
    moduleName === 'react/jsx-runtime' &&
    INTEROP_JSX_ON_WEB.test(context.originModulePath)
  ) {
    moduleName = 'react-native-css-interop/jsx-runtime';
  }
  const resolve = (ctx) =>
    upstream ? upstream(ctx, moduleName, platform) : ctx.resolveRequest(ctx, moduleName, platform);
  if (BROWSER_FIELD_OVER_EXPORTS.test(moduleName)) {
    try {
      return resolve({ ...context, unstable_enablePackageExports: false });
    } catch {}
  }
  return resolve(context);
};

module.exports = withNativeWind(config, { input: './src/global.css' });

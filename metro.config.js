const path = require("node:path");

const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// Node core modules the wallet SDKs reach for; `stream` is for Keystone's UR registry, via bs58check.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  crypto: require.resolve("expo-crypto"),
  stream: require.resolve("readable-stream"),
};

/** `extraNodeModules` misses requests from inside `node_modules`, such as cipher-base's `stream`. */
const NODE_SHIMS = {
  stream: require.resolve("readable-stream"),
  crypto: require.resolve("expo-crypto"),
};

/** Without exports to dodge Metro's `browser`-field warning; newer majors have no `main`, hence the catch. */
const BROWSER_FIELD_OVER_EXPORTS = /^(uint8arrays|multiformats|@noble\/hashes)(\/|$)/;

/** On web Metro takes Reanimated's precompiled `main`, whose `react/jsx-runtime` import drops `className`. */
const INTEROP_JSX_ON_WEB = /\/node_modules\/react-native-reanimated\//;

config.resolver.assetExts.push("wasm");
const XMTP_SDK = /\/node_modules\/@xmtp\/browser-sdk\//;
const XMTP_WASM_BINDINGS_ON_WEB = require.resolve("./src/desktop/xmtp-wasm-bindings.ts");
const XMTP_WASM = "@xmtp/wasm-bindings/dist/bindings_wasm_bg.wasm";
const XMTP_WASM_FILE = path.join(path.dirname(require.resolve("@xmtp/wasm-bindings")), "bindings_wasm_bg.wasm");

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = NODE_SHIMS[moduleName];
  if (shim) return { type: "sourceFile", filePath: shim };
  if (moduleName === XMTP_WASM) return { type: "assetFiles", filePaths: [XMTP_WASM_FILE] };
  if (platform === "web" && moduleName === "@xmtp/wasm-bindings" && XMTP_SDK.test(context.originModulePath)) {
    return { type: "sourceFile", filePath: XMTP_WASM_BINDINGS_ON_WEB };
  }
  if (platform === "web" && moduleName === "react/jsx-runtime" && INTEROP_JSX_ON_WEB.test(context.originModulePath)) {
    moduleName = "react-native-css-interop/jsx-runtime";
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

module.exports = withNativeWind(config, { input: "./src/global.css" });

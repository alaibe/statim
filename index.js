/** Polyfills first: viem and WalletConnect capture `globalThis.crypto` as expo-router's routes load. */
import "./src/polyfills";

import "expo-router/entry";

/**
 * Polyfills must be installed before expo-router builds its route tree:
 * requiring the route modules pulls in viem and WalletConnect, which capture
 * `globalThis.crypto` as they evaluate.
 */
import './src/polyfills';

import 'expo-router/entry';

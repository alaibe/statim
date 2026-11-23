/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  /**
   * 20 seconds a test instead of Jest's 5: CI starts from a fresh node_modules
   * with every core busy, and the lock screen's first render went past 5 there
   * while the whole suite takes 18 seconds in a terminal.
   */
  testTimeout: 20000,
  setupFiles: ["<rootDir>/jest.setup.js"],
  /**
   * Skips react-native-worklets' `.native.ts` variants, which bind to JSI on
   * import. Without it no module that touches Reanimated loads in Node.
   */
  resolver: "<rootDir>/node_modules/react-native-worklets/jest/resolver.js",
  /** Agent worktrees under .claude/ hold full copies of the project. */
  testPathIgnorePatterns: ["/node_modules/", "/.claude/"],
  modulePathIgnorePatterns: ["/.claude/"],
  // Mirrors the "@/assets/*" and "@/*" aliases from tsconfig.json, in that order.
  moduleNameMapper: {
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
    // Babel under Jest breaks marked's Unicode-property regexes; the UMD build needs no transform.
    "^marked$": "<rootDir>/node_modules/marked/lib/marked.umd.js",
  },
  // These packages ship untranspiled ESM/Flow and must go through Babel.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-native-svg|@xmtp/.*|@scure/.*|@noble/.*|viem|nativewind|react-native-css-interop|@ngraveio/.*|@keystonehq/.*|uuid))",
  ],
};

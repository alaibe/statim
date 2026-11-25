/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  /** On CI a cold node_modules and busy cores push the lock screen's first render past Jest's 5 s. */
  testTimeout: 20000,
  setupFiles: ["<rootDir>/jest.setup.js"],
  /** Skips react-native-worklets' `.native.ts` files, which bind to JSI on import and break Node. */
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
    // The react-native condition picks Lucide's ESM icons, which Jest can't load untransformed.
    "^lucide-react-native/icons/(.*)$": "<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js",
  },
  // These packages ship untranspiled ESM/Flow and must go through Babel.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-native-svg|@xmtp/.*|@scure/.*|@noble/.*|viem|nativewind|react-native-css-interop|@ngraveio/.*|@keystonehq/.*|uuid))",
  ],
};

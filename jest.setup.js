globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The keychain, in memory. Biometric-sealed values live under their own
 * `keychainService`, so each service gets a store the others cannot read.
 */
jest.mock('expo-secure-store', () => {
  const stores = new Map();
  let denyProtected = false;

  const bucket = (options) => {
    const service = options?.keychainService ?? 'default';
    if (!stores.has(service)) stores.set(service, new Map());
    return stores.get(service);
  };
  const isProtected = (options) => options?.requireAuthentication === true;

  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'whenUnlockedThisDeviceOnly',
    WHEN_UNLOCKED: 'whenUnlocked',
    getItemAsync: async (key, options) => {
      if (isProtected(options) && denyProtected) throw new Error('User canceled');
      const store = bucket(options);
      return store.has(key) ? store.get(key) : null;
    },
    setItemAsync: async (key, value, options) => void bucket(options).set(key, value),
    deleteItemAsync: async (key, options) => void bucket(options).delete(key),

    __reset: () => {
      stores.clear();
      denyProtected = false;
    },
    /** Simulates iOS discarding sealed items after a biometric change. */
    __invalidateProtected: () => {
      for (const [service, store] of stores) {
        if (service !== 'default') store.clear();
      }
    },
    /** Simulates the user refusing, or failing, the biometric prompt. */
    __denyProtected: (value) => {
      denyProtected = value;
    },
  };
});

jest.mock('expo-crypto', () => ({
  getRandomBytes: (size) => {
    // Deterministic but distinct per call, so generated ids do not collide
    // within a test the way a constant fill would.
    let seed = (globalThis.__cryptoSeed = (globalThis.__cryptoSeed ?? 0) + 1);
    const out = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      out[i] = seed & 0xff;
    }
    return out;
  },
}));

// jest.fn() so tests can make the OS prompt succeed, fail or be cancelled.
jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(async () => [2]),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

/**
 * For core commands that push a screen. The real expo-router pulls in the
 * whole navigator, which Jest cannot transform.
 */
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

/**
 * SQLite on Node's own engine: real SQLite, not SQLCipher. See
 * src/storage/testing/expo-sqlite-mock.js.
 */
jest.mock('expo-sqlite', () => require('./src/storage/testing/expo-sqlite-mock'));

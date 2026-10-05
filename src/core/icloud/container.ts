import type { Container } from './cloudkit';

export const ICLOUD_CONTAINER = 'iCloud.im.statim.app';

/** The API token's sign-in callback: a port on the person's own computer, where the desktop waits. */
export const ICLOUD_CALLBACK = 'http://localhost:47219/icloud';

/**
 * Development builds of the iPhone app reach CloudKit's development
 * environment and store builds its production one, so the desktop follows the
 * same split. The token only identifies the app; each person still signs in.
 */
export function icloudContainer(): Container | null {
  const apiToken = process.env.EXPO_PUBLIC_ICLOUD_API_TOKEN;
  if (!apiToken) return null;
  return {
    id: ICLOUD_CONTAINER,
    environment: __DEV__ ? 'development' : 'production',
    apiToken,
  };
}

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * Items the notification service extension reads to show who wrote and what.
 * It runs while the phone may be locked, so they open after the first unlock.
 */
function options(): SecureStore.SecureStoreOptions {
  const ios = Constants.expoConfig?.ios;
  return {
    keychainService: 'statim.push',
    accessGroup: `${ios?.appleTeamId}.${ios?.bundleIdentifier}.shared`,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  };
}

export function shareWithExtension(key: string, value: string): Promise<void> {
  return SecureStore.setItemAsync(key, value, options());
}

export function sharedWithExtension(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key, options());
}

export function unshare(key: string): Promise<void> {
  return SecureStore.deleteItemAsync(key, options());
}

/** What the extension reads for one protocol of one account. */
export function pushSecretKey(protocol: 'matrix' | 'telegram', accountId: string): string {
  return `push.${protocol}.${accountId}`;
}

/** What the extension reads to open a note the desktop left in iCloud, named by the note's tag. */
export function noteSecretKey(tag: string): string {
  return `icloud.${tag}`;
}

export async function forgetPushSecrets(accountId: string): Promise<void> {
  await unshare(pushSecretKey('matrix', accountId));
  await unshare(pushSecretKey('telegram', accountId));
}

import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

/**
 * Shared with the notification service extension, which may run while the
 * phone is locked, so items open after the first unlock.
 */
function options(): SecureStore.SecureStoreOptions {
  const ios = Constants.expoConfig?.ios;
  return {
    keychainService: 'statim.notes',
    accessGroup: `${ios?.appleTeamId}.${ios?.bundleIdentifier}.shared`,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  };
}

export function shareWithExtension(key: string, value: string): Promise<void> {
  return SecureStore.setItemAsync(key, value, options());
}

export function unshare(key: string): Promise<void> {
  return SecureStore.deleteItemAsync(key, options());
}

/** What the extension reads to open a note the desktop left in iCloud, named by the note's tag. */
export function noteSecretKey(tag: string): string {
  return `icloud.${tag}`;
}

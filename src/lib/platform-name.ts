import { Platform } from 'react-native';

/** The system this app runs on, as a bug report names it. */
export const PLATFORM_NAME =
  Platform.OS === 'android' ? `Android ${Platform.constants.Release}` : `iOS ${Platform.Version}`;

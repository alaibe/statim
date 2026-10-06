import { requireOptionalNativeModule } from 'expo-modules-core';

interface ICloudNotesModule {
  /** Whether the phone is signed in to an iCloud account that can use the container. */
  available(container: string): Promise<boolean>;
  /** Makes the zone the desktop saves notes in and asks iCloud to wake this phone, with a mutable alert, for each one. */
  subscribe(container: string): Promise<void>;
  /** Stops the pushes and deletes the zone with any notes still in it, so the desktop stops saving them. */
  unsubscribe(container: string): Promise<void>;
}

export default requireOptionalNativeModule<ICloudNotesModule>('ICloudNotes');

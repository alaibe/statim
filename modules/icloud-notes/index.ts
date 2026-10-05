import { requireOptionalNativeModule } from 'expo-modules-core';

interface ICloudNotesModule {
  /** Whether the phone is signed in to an iCloud account that can use the container. */
  available(container: string): Promise<boolean>;
  /** Asks iCloud to wake this phone, with a mutable alert, whenever a note is saved. */
  subscribe(container: string): Promise<void>;
  unsubscribe(container: string): Promise<void>;
}

export default requireOptionalNativeModule<ICloudNotesModule>('ICloudNotes');

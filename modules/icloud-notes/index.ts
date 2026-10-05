import { requireOptionalNativeModule } from 'expo-modules-core';

export type ICloudAccountStatus =
  | 'available'
  | 'noAccount'
  | 'restricted'
  | 'temporarilyUnavailable'
  | 'couldNotDetermine';

interface ICloudNotesModule {
  accountStatus(container: string): Promise<ICloudAccountStatus>;
  /** Asks iCloud to wake this phone, with a mutable alert, whenever a note is saved. */
  subscribe(container: string): Promise<void>;
  unsubscribe(container: string): Promise<void>;
}

export default requireOptionalNativeModule<ICloudNotesModule>('ICloudNotes');

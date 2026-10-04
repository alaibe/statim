import { requireNativeModule } from 'expo-modules-core';

interface StayConnectedModule {
  isEnabled(): boolean;
  setEnabled(on: boolean): void;
  resume(): void;
}

export default requireNativeModule<StayConnectedModule>('StayConnected');

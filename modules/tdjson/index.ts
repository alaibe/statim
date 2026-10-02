import { requireNativeModule } from 'expo-modules-core';

interface TdJsonModule {
  create(): number;
  send(clientId: number, request: string): void;
  /** A JSON array of what every client said, empty when TDLib had nothing within `timeout` seconds. */
  receive(timeout: number, limit: number): Promise<string>;
  destroy(clientId: number): void;
}

export default requireNativeModule<TdJsonModule>('TdJson');

import { PermissionsAndroid, Platform } from 'react-native';

import { registerVendor, type HardwareSigner } from '../hardware';
import { ledgerSigner, type AppEth } from './ledger-signer';

interface LedgerDevice {
  id: string;
  name: string;
}

interface TransportModule {
  default: {
    listen(observer: {
      next(event: { type: string; descriptor: LedgerDevice }): void;
      error(error: unknown): void;
      complete(): void;
    }): { unsubscribe(): void };
    open(id: string): Promise<unknown>;
  };
}

interface EthModule {
  default: new (transport: unknown) => AppEth;
}

async function allowBluetooth(): Promise<void> {
  if (Platform.OS !== 'android' || Platform.Version < 31) return;
  const granted = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  if (Object.values(granted).some((answer) => answer !== PermissionsAndroid.RESULTS.GRANTED)) {
    throw new Error('Allow Nearby devices for Statim in Android Settings to find your Ledger.');
  }
}

async function scanForLedgers(
  onFound: (device: LedgerDevice) => void,
  onError: (error: unknown) => void
): Promise<() => void> {
  await allowBluetooth();
  const { default: Transport } = (await import(
    '@ledgerhq/react-native-hw-transport-ble'
  )) as unknown as TransportModule;

  const subscription = Transport.listen({
    next: (event) => {
      if (event.type === 'add') onFound(event.descriptor);
    },
    error: onError,
    complete: () => {},
  });

  return () => subscription.unsubscribe();
}

async function connectLedger(deviceId: string): Promise<HardwareSigner> {
  await allowBluetooth();
  const [{ default: Transport }, { default: AppEth }] = await Promise.all([
    import('@ledgerhq/react-native-hw-transport-ble') as unknown as Promise<TransportModule>,
    import('@ledgerhq/hw-app-eth') as unknown as Promise<EthModule>,
  ]);

  return ledgerSigner(new AppEth(await Transport.open(deviceId)));
}

export function registerLedger(): void {
  registerVendor({
    id: 'ledger',
    label: 'Ledger',
    connection: 'bluetooth',
    scan: scanForLedgers,
    connect: connectLedger,
  });
}

import { invoke } from '@tauri-apps/api/core';
import Transport from '@ledgerhq/hw-transport';

import { registerVendor, type HardwareSigner } from '../hardware';
import { ledgerSigner } from './ledger-signer';
import { SPECULOS, speculosRunning, speculosTransport } from './speculos';

interface LedgerDevice {
  path: string;
  name: string;
}

/**
 * APDUs travel through the Rust side, which holds the Ledger open on USB;
 * the window's WebKit has no WebHID.
 */
class TauriHidTransport extends Transport {
  override async exchange(apdu: Buffer): Promise<Buffer> {
    const response = await invoke<number[]>('ledger_exchange', { apdu: Array.from(apdu) });
    return Buffer.from(response);
  }

  override async close(): Promise<void> {
    await invoke('ledger_close');
  }
}

/** USB has no discovery events: the list is polled while the sheet is open. */
async function scanForLedgers(
  onFound: (device: { id: string; name: string }) => void,
  onError: (error: unknown) => void
): Promise<() => void> {
  void speculosRunning().then((running) => running && onFound(SPECULOS));
  const poll = async () => {
    try {
      for (const device of await invoke<LedgerDevice[]>('ledger_list')) {
        onFound({ id: device.path, name: device.name });
      }
    } catch (error) {
      onError(error);
    }
  };
  await poll();
  const timer = setInterval(() => void poll(), 1500);
  return () => clearInterval(timer);
}

async function connectLedger(deviceId: string): Promise<HardwareSigner> {
  const { default: AppEth } = await import('@ledgerhq/hw-app-eth');
  if (deviceId === SPECULOS.id) return ledgerSigner(new AppEth(speculosTransport()));

  await invoke('ledger_open', { path: deviceId });
  return ledgerSigner(new AppEth(new TauriHidTransport()));
}

export function registerLedger(): void {
  registerVendor({
    id: 'ledger',
    label: 'Ledger',
    connection: 'usb',
    scan: scanForLedgers,
    connect: connectLedger,
  });
}

import type { UR } from '@ngraveio/bc-ur';
import { create } from 'zustand';

import type { HardwareKey, HardwareSigner, HardwareVendor } from './hardware';

export type QrPurpose = 'message' | 'transaction' | 'typedData';

export type LinkedVendor = Extract<HardwareVendor, { connection: 'bluetooth' | 'usb' }>;

export type DevicePrompt =
  | {
      kind: 'connect';
      vendor: LinkedVendor;
      key: HardwareKey;
      settle(result: HardwareSigner | Error): void;
    }
  | {
      kind: 'qr';
      vendor: HardwareVendor;
      parts: string[];
      purpose: QrPurpose;
      settle(result: UR | Error): void;
    }
  | { kind: 'confirm'; vendor: HardwareVendor };

export const useDevicePrompt = create<{ prompt: DevicePrompt | null }>(() => ({ prompt: null }));

export class Cancelled extends Error {
  constructor() {
    super('Cancelled.');
  }
}

export function cancelPrompt(prompt: DevicePrompt): void {
  if (prompt.kind !== 'confirm') prompt.settle(new Cancelled());
  else if (prompt.vendor.connection === 'companion-app') prompt.vendor.cancel();
}

function ask<T>(prompt: (settle: (result: T | Error) => void) => DevicePrompt): Promise<T> {
  const current = useDevicePrompt.getState().prompt;
  if (current && current.kind !== 'confirm') {
    return Promise.reject(new Error('Finish what the hardware wallet is asking first.'));
  }
  return new Promise<T>((resolve, reject) => {
    const settle = (result: T | Error) => {
      useDevicePrompt.setState({ prompt: null });
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    useDevicePrompt.setState({ prompt: prompt(settle) });
  });
}

export function askToConnect(vendor: LinkedVendor, key: HardwareKey): Promise<HardwareSigner> {
  return ask<HardwareSigner>((settle) => ({ kind: 'connect', vendor, key, settle }));
}

export function askToExchange(
  vendor: HardwareVendor,
  request: { parts: string[]; purpose: QrPurpose }
): Promise<UR> {
  return ask<UR>((settle) => ({ kind: 'qr', vendor, ...request, settle }));
}

/** Says the wallet is waiting on the person; the returned function takes it back. */
export function showConfirming(vendor: HardwareVendor): () => void {
  useDevicePrompt.setState({ prompt: { kind: 'confirm', vendor } });
  return () => {
    if (useDevicePrompt.getState().prompt?.kind === 'confirm') {
      useDevicePrompt.setState({ prompt: null });
    }
  };
}

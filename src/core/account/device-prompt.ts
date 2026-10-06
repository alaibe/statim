import type { Address } from 'viem';
import { create } from 'zustand';

import type { HardwareSigner } from './hardware';
import type { QrPurpose } from './vendors/keystone';

/** What the person has to do on a hardware wallet before Statim can go on. */
export type DevicePrompt =
  | {
      kind: 'connect';
      vendorId: string;
      label: string;
      address: Address;
      path: string;
      settle(result: HardwareSigner | Error): void;
    }
  | {
      kind: 'qr';
      label: string;
      parts: string[];
      purpose: QrPurpose;
      settle(result: string[] | Error): void;
    }
  | { kind: 'confirm'; label: string; inApp: boolean; cancel?(): void };

export const useDevicePrompt = create<{ prompt: DevicePrompt | null }>(() => ({ prompt: null }));

export class Cancelled extends Error {
  constructor() {
    super('Cancelled.');
  }
}

export function cancelPrompt(prompt: DevicePrompt): void {
  if (prompt.kind === 'confirm') prompt.cancel?.();
  else prompt.settle(new Cancelled());
}

function ask<T>(prompt: (settle: (result: T | Error) => void) => DevicePrompt): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const settle = (result: T | Error) => {
      useDevicePrompt.setState({ prompt: null });
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const current = useDevicePrompt.getState().prompt;
    if (current && current.kind !== 'confirm') {
      reject(new Error('Finish what the hardware wallet is asking first.'));
      return;
    }
    useDevicePrompt.setState({ prompt: prompt(settle) });
  });
}

export function askToConnect(request: {
  vendorId: string;
  label: string;
  address: Address;
  path: string;
}): Promise<HardwareSigner> {
  return ask<HardwareSigner>((settle) => ({ kind: 'connect', ...request, settle }));
}

export function askToExchange(
  label: string,
  request: { parts: string[]; purpose: QrPurpose }
): Promise<string[]> {
  return ask<string[]>((settle) => ({ kind: 'qr', label, ...request, settle }));
}

/** Says the device is waiting on the person; the returned function takes it back. */
export function showConfirming(label: string, inApp: boolean, cancel?: () => void): () => void {
  useDevicePrompt.setState({ prompt: { kind: 'confirm', label, inApp, cancel } });
  return () => {
    if (useDevicePrompt.getState().prompt?.kind === 'confirm') {
      useDevicePrompt.setState({ prompt: null });
    }
  };
}

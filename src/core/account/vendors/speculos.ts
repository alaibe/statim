import Transport from '@ledgerhq/hw-transport';
import { Platform } from 'react-native';

import { appFetch } from '@/lib/http';

const API = Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://127.0.0.1:5000';

/** In a debug build, Speculos running on this computer is listed like a Ledger. */
export const SPECULOS = { id: 'speculos', name: 'Speculos (emulator)' };

class SpeculosTransport extends Transport {
  override async exchange(apdu: Buffer): Promise<Buffer> {
    const response = await appFetch(`${API}/apdu`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: apdu.toString('hex') }),
    });
    const { data } = (await response.json()) as { data: string };
    return Buffer.from(data, 'hex');
  }
}

export async function speculosRunning(): Promise<boolean> {
  if (!__DEV__) return false;
  return appFetch(`${API}/events?currentscreenonly=true`).then(
    (response) => response.ok,
    () => false
  );
}

export function speculosTransport(): Transport {
  return new SpeculosTransport();
}

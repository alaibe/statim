import { QrScanner } from '@/design';
import type { PluginContext } from '@/core/plugins/types';
import { errorMessage } from '@/core/errors';

import { useWalletConnectStore } from '../walletconnect';

export function makeScanOverlay(context: PluginContext) {
  return function ScanOverlay() {
    const scanning = useWalletConnectStore((s) => s.scanning);
    const setScanning = useWalletConnectStore((s) => s.setScanning);
    if (!scanning) return null;

    const pair = async (data: string) => {
      if (!data.startsWith('wc:')) return 'That is a QR code, but not a WalletConnect one.';
      try {
        const store = useWalletConnectStore.getState();
        if (!store.kit) await store.init();
        await store.pair(data);
      } catch (e) {
        return errorMessage(e, 'Could not pair with that code');
      }
      context.ui.notify('Pairing… approve the request when it appears.');
      setScanning(false);
      return null;
    };

    return (
      <QrScanner
        title="Scan to connect"
        closeLabel="Stop scanning"
        purpose="Point the camera at the WalletConnect code a site shows you. It is used for that and nothing else, and no image leaves this device."
        hint="Choose WalletConnect on the site, then scan the code it shows."
        onScanned={pair}
        onClose={() => setScanning(false)}
      />
    );
  };
}

import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useState } from 'react';
import { AppState, Linking, Modal, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Button } from './button';
import { ErrorText } from './error-text';
import { ModalHeader } from './modal-header';
import { Screen } from './screen';
import { Text } from './text';

export interface QrScannerProps {
  title: string;
  closeLabel?: string;
  /** Shown until the camera is allowed: what the camera is for. */
  purpose: string;
  hint: string;
  /** Resolves to what went wrong, which keeps the camera open, or to null when the scan is used. */
  onScanned(data: string): Promise<string | null>;
  onClose(): void;
}

/** A full-screen camera that reads QR codes. A scanned code is a string a stranger may control. */
export function QrScanner(props: QrScannerProps) {
  return (
    <Modal visible animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaProvider>
        <Scanner {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function Scanner({ title, closeLabel, purpose, hint, onScanned, onClose }: QrScannerProps) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        getPermission().catch(() => setError('Could not check camera permission'));
      }
    });
    return () => subscription.remove();
  }, [getPermission]);

  const allowCamera = async () => {
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch {
      setError('Could not request camera access');
    }
  };

  // The camera reports a code on every frame it is in view, so one is handled at a time.
  const scanned = async ({ data }: { data: string }) => {
    setBusy(true);
    const problem = await onScanned(data);
    setError(problem);
    if (problem) setBusy(false);
  };

  return (
    <Screen className="px-0" edges={['top', 'bottom']}>
      <ModalHeader title={title} closeLabel={closeLabel} onClose={onClose} className="px-gutter" />

      {permission?.granted ? (
        <View className="flex-1 overflow-hidden">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : (scan) => void scanned(scan)}
            onMountError={({ message }) => setError(message)}
          />
        </View>
      ) : (
        <View className="flex-1 justify-center gap-4 px-gutter">
          <Text variant="bodyMuted">{purpose}</Text>
          <Button
            label={permission?.canAskAgain === false ? 'Open Settings' : 'Allow the camera'}
            fullWidth
            onPress={allowCamera}
          />
        </View>
      )}

      <View className="gap-2 px-gutter pt-3">
        {error ? <ErrorText>{error}</ErrorText> : <Text variant="caption">{hint}</Text>}
      </View>
    </Screen>
  );
}

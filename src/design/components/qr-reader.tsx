import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, View } from 'react-native';

import { cn } from '../lib/cn';
import { Button } from './button';
import { ErrorText } from './error-text';
import { Text } from './text';

export interface QrReaderProps {
  /** Shown until the camera is allowed: what the camera is for. */
  purpose: string;
  /**
   * Resolves to what went wrong, which keeps the camera open, to null when the
   * scan is used, or to undefined to keep reading, as for one frame of several.
   */
  onScanned(data: string): Promise<string | null | undefined>;
  className?: string;
}

/** A camera that reads QR codes. A scanned code is a string a stranger may control. */
export function QrReader({ purpose, onScanned, className }: QrReaderProps) {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const busy = useRef(false);
  const seen = useRef(new Set<string>());

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

  const scanned = async ({ data }: { data: string }) => {
    if (busy.current || seen.current.has(data)) return;
    seen.current.add(data);
    busy.current = true;
    const result = await onScanned(data);
    busy.current = false;
    if (result === null) setDone(true);
    else setError(result ?? null);
  };

  return (
    <View className={cn('gap-2', className)}>
      {permission?.granted ? (
        <View className="flex-1 overflow-hidden rounded-card">
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={done ? undefined : (scan) => void scanned(scan)}
            onMountError={({ message }) => setError(message)}
          />
        </View>
      ) : (
        <View className="flex-1 justify-center gap-4">
          <Text variant="bodyMuted">{purpose}</Text>
          <Button
            label={permission?.canAskAgain === false ? 'Open Settings' : 'Allow the camera'}
            fullWidth
            onPress={allowCamera}
          />
        </View>
      )}
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

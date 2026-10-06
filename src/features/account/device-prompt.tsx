import { URDecoder } from '@ngraveio/bc-ur';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';

import {
  AnimatedQrCode,
  Button,
  ErrorText,
  ListItem,
  QrReader,
  RowIcon,
  Sheet,
  Text,
  useThemeColors,
  type IconName,
} from '@/design';
import { SHEET_DISMISS_MS, useSheetStore } from '@/design/components/sheet';
import { errorMessage } from '@/core/errors';
import { cancelPrompt, useDevicePrompt, type DevicePrompt } from '@/core/account/device-prompt';
import { vendor, type HardwareConnection, type HardwareVendor } from '@/core/account/hardware';

export const CONNECTION: Record<
  HardwareConnection,
  { icon: IconName; searching: string; how: string }
> = {
  bluetooth: {
    icon: 'bluetooth-outline',
    searching: 'Looking for nearby wallets…',
    how: 'Unlock it and open the Ethereum app, then keep it nearby.',
  },
  usb: {
    icon: 'hardware-chip-outline',
    searching: 'Looking for a plugged-in wallet…',
    how: 'Plug it in, unlock it and open the Ethereum app.',
  },
  qr: {
    icon: 'qr-code-outline',
    searching: '',
    how: 'You scan a QR code from its screen, and it scans one from yours.',
  },
  'companion-app': {
    icon: 'phone-portrait-outline',
    searching: '',
    how:
      Platform.OS === 'ios'
        ? 'Needs Trezor Suite and a Trezor Safe 7, which connects to it over Bluetooth.'
        : 'Trezor Suite opens to confirm; you come back here when it is done.',
  },
};

/** Wallets the vendor finds on its link, listed as they appear. */
export function DeviceList({
  vendor: chosen,
  disabled,
  onPick,
}: {
  vendor: HardwareVendor;
  disabled: boolean;
  onPick(deviceId: string): void;
}) {
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chosen.scan) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    const failed = (e: unknown) => setError(errorMessage(e, 'Could not look for wallets'));
    chosen
      .scan(
        (device) =>
          setDevices((prev) => (prev.some((d) => d.id === device.id) ? prev : [...prev, device])),
        failed
      )
      .then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else stop = unsubscribe;
      })
      .catch(failed);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [chosen]);

  const connection = CONNECTION[chosen.connection];
  return (
    <>
      {devices.length === 0 ? (
        <Text variant="caption">{connection.searching}</Text>
      ) : (
        devices.map((device) => (
          <ListItem
            key={device.id}
            testID={`hardware-device-${device.id}`}
            title={device.name || 'Unnamed wallet'}
            leading={<RowIcon name={connection.icon} tone="blue" />}
            onPress={disabled ? undefined : () => onPick(device.id)}
          />
        ))
      )}
      <ErrorText>{error}</ErrorText>
    </>
  );
}

function Reconnect({ prompt }: { prompt: Extract<DevicePrompt, { kind: 'connect' }> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = vendor(prompt.vendorId);

  const pick = async (deviceId: string) => {
    setBusy(true);
    setError(null);
    try {
      const signer = await chosen.connect!(deviceId);
      const address = await signer.getAddress(prompt.path);
      if (address.toLowerCase() !== prompt.address.toLowerCase()) {
        throw new Error(`That ${prompt.label} holds a different account.`);
      }
      prompt.settle(signer);
    } catch (e) {
      setError(errorMessage(e, `Could not reach your ${prompt.label}`));
      setBusy(false);
    }
  };

  return (
    <>
      <Text variant="footnote">{CONNECTION[chosen.connection].how}</Text>
      <DeviceList vendor={chosen} disabled={busy} onPick={(id) => void pick(id)} />
      <ErrorText>{error}</ErrorText>
      <Button label="Cancel" tone="neutral" fullWidth onPress={() => cancelPrompt(prompt)} />
    </>
  );
}

const PURPOSE = {
  message: 'a message',
  transaction: 'a transaction',
  typedData: 'a signature request',
} as const;

function QrExchange({ prompt }: { prompt: Extract<DevicePrompt, { kind: 'qr' }> }) {
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const decoder = useRef(new URDecoder());
  const frames = useRef<string[]>([]);

  const read = async (data: string) => {
    try {
      decoder.current.receivePart(data.toLowerCase());
    } catch {
      return `That is not the signature your ${prompt.label} shows.`;
    }
    frames.current.push(data);
    if (decoder.current.isComplete()) {
      prompt.settle(frames.current);
      return null;
    }
    setProgress(Math.round(decoder.current.estimatedPercentComplete() * 100));
    return undefined;
  };

  return (
    <>
      {scanning ? (
        <>
          <Text variant="footnote">Scan the signature your {prompt.label} shows.</Text>
          <QrReader
            purpose={`The camera reads the signature from your ${prompt.label}, and nothing else.`}
            onScanned={read}
            className="h-72"
          />
          {progress > 0 ? <Text variant="caption">Keep it in view: {progress}%</Text> : null}
        </>
      ) : (
        <>
          <Text variant="footnote">
            Scan this with your {prompt.label} to sign {PURPOSE[prompt.purpose]}, and check what it
            shows before you approve.
          </Text>
          <View className="items-center">
            <AnimatedQrCode parts={prompt.parts} />
          </View>
          <Button label="Scan the signature" fullWidth onPress={() => setScanning(true)} />
        </>
      )}
      <Button label="Cancel" tone="neutral" fullWidth onPress={() => cancelPrompt(prompt)} />
    </>
  );
}

function Confirming({ prompt }: { prompt: Extract<DevicePrompt, { kind: 'confirm' }> }) {
  const colors = useThemeColors();
  return (
    <>
      <View className="flex-row items-center gap-3">
        <ActivityIndicator color={colors.content} />
        <Text variant="footnote" className="flex-1">
          {prompt.inApp
            ? `Finish in ${prompt.label} Suite, then come back to Statim.`
            : `Check the details on your ${prompt.label} and approve them there.`}
        </Text>
      </View>
      {prompt.cancel ? (
        <Button label="Cancel" tone="neutral" fullWidth onPress={() => cancelPrompt(prompt)} />
      ) : null}
    </>
  );
}

export function devicePromptTitle(prompt: DevicePrompt): string {
  switch (prompt.kind) {
    case 'connect':
      return `Connect your ${prompt.label}`;
    case 'qr':
      return `Sign on your ${prompt.label}`;
    case 'confirm':
      return prompt.inApp ? `Waiting for ${prompt.label} Suite` : `Confirm on your ${prompt.label}`;
  }
}

export function DevicePromptBody({ prompt }: { prompt: DevicePrompt }) {
  switch (prompt.kind) {
    case 'connect':
      return <Reconnect prompt={prompt} />;
    case 'qr':
      return <QrExchange prompt={prompt} />;
    case 'confirm':
      return <Confirming prompt={prompt} />;
  }
}

/**
 * Shows what a hardware wallet asks for in a sheet of its own. While another
 * sheet is up, the sheet route shows it there instead, since one sheet at a
 * time is all a phone presents.
 */
export function DevicePromptHost() {
  const prompt = useDevicePrompt((s) => s.prompt);
  const [lingering, setLingering] = useState<DevicePrompt | null>(null);
  const [mine, setMine] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let opening: ReturnType<typeof setTimeout> | undefined;
    // A sheet that just closed may still be animating, and nothing else can present until then.
    const open = () => {
      clearTimeout(opening);
      opening = setTimeout(() => {
        if (useDevicePrompt.getState().prompt) setMine(true);
      }, SHEET_DISMISS_MS);
    };
    const stopPrompt = useDevicePrompt.subscribe(({ prompt: next }, { prompt: before }) => {
      clearTimeout(timer);
      if (next) {
        setLingering(next);
        if (!before && useSheetStore.getState().current === null) open();
        return;
      }
      // One request often follows another, as connecting does before confirming.
      timer = setTimeout(() => {
        setLingering(null);
        setMine(false);
      }, 400);
    });
    const stopSheet = useSheetStore.subscribe(({ current }) => {
      if (current === null && useDevicePrompt.getState().prompt) open();
    });
    return () => {
      clearTimeout(timer);
      clearTimeout(opening);
      stopPrompt();
      stopSheet();
    };
  }, []);

  const shown = prompt ?? lingering;
  return (
    <Sheet
      visible={mine && shown !== null}
      title={shown ? devicePromptTitle(shown) : undefined}
      onClose={() => {
        const current = useDevicePrompt.getState().prompt;
        if (current) cancelPrompt(current);
      }}>
      {shown ? <DevicePromptBody prompt={shown} /> : null}
    </Sheet>
  );
}

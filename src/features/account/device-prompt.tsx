import type { UR } from '@ngraveio/bc-ur';
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
import {
  cancelPrompt,
  useDevicePrompt,
  type DevicePrompt,
  type LinkedVendor,
} from '@/core/account/device-prompt';
import { connectTo } from '@/core/account/device-session';
import type { HardwareConnection } from '@/core/account/hardware';
import { urReader } from '@/core/account/vendors/keystone';

export const CONNECTION: Record<HardwareConnection, { icon: IconName; how: string }> = {
  bluetooth: {
    icon: 'bluetooth-outline',
    how: 'Unlock it and open the Ethereum app, then keep it nearby.',
  },
  usb: {
    icon: 'hardware-chip-outline',
    how: 'Plug it in, unlock it and open the Ethereum app.',
  },
  qr: {
    icon: 'qr-code-outline',
    how: 'You scan a QR code from its screen, and it scans one from yours.',
  },
  'companion-app': {
    icon: 'phone-portrait-outline',
    how:
      Platform.OS === 'ios'
        ? 'Needs Trezor Suite and a Trezor Safe 7, which connects to it over Bluetooth.'
        : 'Trezor Suite opens to confirm; you come back here when it is done.',
  },
};

const SEARCHING = {
  bluetooth: 'Looking for nearby wallets…',
  usb: 'Looking for a plugged-in wallet…',
};

export function DeviceList({
  vendor,
  onPick,
}: {
  vendor: LinkedVendor;
  onPick(deviceId: string): void;
}) {
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    const failed = (e: unknown) => setError(errorMessage(e, 'Could not look for wallets'));
    vendor
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
  }, [vendor]);

  return (
    <>
      {devices.length === 0 ? (
        <Text variant="caption">{SEARCHING[vendor.connection]}</Text>
      ) : (
        devices.map((device) => (
          <ListItem
            key={device.id}
            testID={`hardware-device-${device.id}`}
            title={device.name || 'Unnamed wallet'}
            leading={<RowIcon name={CONNECTION[vendor.connection].icon} tone="blue" />}
            onPress={() => onPick(device.id)}
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

  const pick = async (deviceId: string) => {
    setBusy(true);
    setError(null);
    try {
      prompt.settle(await connectTo(prompt.vendor, deviceId, prompt.key));
    } catch (e) {
      setError(errorMessage(e, `Could not reach your ${prompt.vendor.label}`));
      setBusy(false);
    }
  };

  return (
    <>
      <Text variant="footnote">{CONNECTION[prompt.vendor.connection].how}</Text>
      {busy ? (
        <Text variant="caption">Connecting…</Text>
      ) : (
        <DeviceList vendor={prompt.vendor} onPick={(id) => void pick(id)} />
      )}
      <ErrorText>{error}</ErrorText>
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
  const reader = useRef<ReturnType<typeof urReader> | null>(null);
  const label = prompt.vendor.label;

  const read = async (data: string) => {
    reader.current ??= urReader();
    let result: UR | number;
    try {
      result = reader.current.read(data);
    } catch (e) {
      reader.current = null;
      return errorMessage(e, `That is not the signature your ${label} shows.`);
    }
    if (typeof result === 'number') {
      setProgress(Math.round(result * 100));
      return undefined;
    }
    prompt.settle(result);
    return null;
  };

  return scanning ? (
    <>
      <Text variant="footnote">Scan the signature your {label} shows.</Text>
      <QrReader
        purpose={`The camera reads the signature from your ${label}, and nothing else.`}
        onScanned={read}
        className="h-72"
      />
      {progress > 0 ? <Text variant="caption">Keep it in view: {progress}%</Text> : null}
    </>
  ) : (
    <>
      <Text variant="footnote">
        Scan this with your {label} to sign {PURPOSE[prompt.purpose]}, and check what it shows
        before you approve.
      </Text>
      <View className="items-center">
        <AnimatedQrCode parts={prompt.parts} />
      </View>
      <Button label="Scan the signature" fullWidth onPress={() => setScanning(true)} />
    </>
  );
}

function Confirming({ prompt }: { prompt: Extract<DevicePrompt, { kind: 'confirm' }> }) {
  const colors = useThemeColors();
  const { label, connection } = prompt.vendor;
  return (
    <View className="flex-row items-center gap-3">
      <ActivityIndicator color={colors.content} />
      <Text variant="footnote" className="flex-1">
        {connection === 'companion-app'
          ? `Finish in ${label} Suite, then come back to Statim.`
          : `Check the details on your ${label} and approve them there.`}
      </Text>
    </View>
  );
}

export function devicePromptTitle(prompt: DevicePrompt): string {
  const { label, connection } = prompt.vendor;
  switch (prompt.kind) {
    case 'connect':
      return `Connect your ${label}`;
    case 'qr':
      return `Sign on your ${label}`;
    case 'confirm':
      return connection === 'companion-app'
        ? `Waiting for ${label} Suite`
        : `Confirm on your ${label}`;
  }
}

export function DevicePromptBody({ prompt }: { prompt: DevicePrompt }) {
  const cancellable = prompt.kind !== 'confirm' || prompt.vendor.connection === 'companion-app';
  return (
    <>
      {prompt.kind === 'connect' ? (
        <Reconnect prompt={prompt} />
      ) : prompt.kind === 'qr' ? (
        <QrExchange prompt={prompt} />
      ) : (
        <Confirming prompt={prompt} />
      )}
      {cancellable ? (
        <Button label="Cancel" tone="neutral" fullWidth onPress={() => cancelPrompt(prompt)} />
      ) : null}
    </>
  );
}

/**
 * Shows what a hardware wallet asks for in a sheet of its own. While another
 * sheet is up, the sheet route shows it there instead, since one sheet at a
 * time is all a phone presents.
 */
export function DevicePromptHost() {
  const [hosted, setHosted] = useState<DevicePrompt | null>(null);

  useEffect(() => {
    let closing: ReturnType<typeof setTimeout> | undefined;
    let opening: ReturnType<typeof setTimeout> | undefined;
    // A sheet that just closed may still be animating, and nothing else can present until then.
    const open = () => {
      clearTimeout(opening);
      opening = setTimeout(() => setHosted(useDevicePrompt.getState().prompt), SHEET_DISMISS_MS);
    };
    const stopPrompt = useDevicePrompt.subscribe(({ prompt: next }, { prompt: before }) => {
      clearTimeout(closing);
      if (next) {
        setHosted((current) => (current ? next : current));
        if (!before && useSheetStore.getState().current === null) open();
        return;
      }
      // One request often follows another, as connecting does before confirming.
      closing = setTimeout(() => setHosted(null), 400);
    });
    const stopSheet = useSheetStore.subscribe(({ current }) => {
      if (current === null && useDevicePrompt.getState().prompt) open();
    });
    return () => {
      clearTimeout(closing);
      clearTimeout(opening);
      stopPrompt();
      stopSheet();
    };
  }, []);

  return (
    <Sheet
      visible={hosted !== null}
      title={hosted ? devicePromptTitle(hosted) : undefined}
      onClose={() => {
        const current = useDevicePrompt.getState().prompt;
        if (current) cancelPrompt(current);
      }}>
      {hosted ? <DevicePromptBody prompt={hosted} /> : null}
    </Sheet>
  );
}

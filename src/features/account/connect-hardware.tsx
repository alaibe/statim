import type { UR } from '@ngraveio/bc-ur';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, ErrorText, ListItem, Note, QrReader, RowIcon, Sheet, Text, toast } from '@/design';
import { errorMessage } from '@/core/errors';
import { Cancelled, type LinkedVendor } from '@/core/account/device-prompt';
import {
  DEFAULT_EVM_PATH,
  hardwareVendors,
  type HardwareSigner,
  type HardwareVendor,
} from '@/core/account/hardware';
import { useAccountStore } from '@/core/account/account-store';
import { readAccountUr, urReader } from '@/core/account/vendors/keystone';

import { CONNECTION, DeviceList } from './device-prompt';

export function ConnectHardware({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const addHardwareAccount = useAccountStore((s) => s.addHardwareAccount);
  const [chosen, setChosen] = useState<HardwareVendor | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reader = useRef<ReturnType<typeof urReader> | null>(null);

  const leave = () => {
    if (chosen?.connection === 'companion-app') chosen.cancel();
    reader.current = null;
    setChosen(null);
    setBusy(null);
    setError(null);
  };

  const finish = async (
    wallet: HardwareVendor,
    signer: HardwareSigner,
    key: { path: string; device?: string; xfp?: string }
  ) => {
    setBusy(
      wallet.connection === 'companion-app'
        ? 'Finish in Trezor Suite: it asks for your address, then to sign Statim’s chat key message.'
        : `Approve on your ${wallet.label}: it signs Statim’s chat key message, which moves no funds.`
    );
    setError(null);
    try {
      const address = await signer.getAddress(key.path);
      await addHardwareAccount({
        address,
        vendorId: wallet.id,
        label: wallet.label,
        signer,
        ...key,
      });
      toast.success(`${wallet.label} connected`);
      setChosen(null);
      setBusy(null);
      onClose();
    } catch (e) {
      if (!(e instanceof Cancelled)) {
        setError(errorMessage(e, `Could not connect your ${wallet.label}`));
      }
      setBusy(null);
    }
  };

  const pick = async (wallet: LinkedVendor, deviceId: string) => {
    setBusy(`Connecting to your ${wallet.label}…`);
    try {
      await finish(wallet, await wallet.connect(deviceId), {
        path: DEFAULT_EVM_PATH,
        device: deviceId,
      });
    } catch (e) {
      setError(errorMessage(e, `Could not reach your ${wallet.label}`));
      setBusy(null);
    }
  };

  const choose = (wallet: HardwareVendor) => {
    setError(null);
    setChosen(wallet);
    if (wallet.connection === 'companion-app') {
      void finish(wallet, wallet.open(), { path: DEFAULT_EVM_PATH });
    }
  };

  const content = () => {
    if (!chosen) {
      return (
        <>
          <Note icon="hardware-chip-outline">
            <Text variant="footnote">
              The key stays on the device. Every payment is confirmed on the wallet itself, so
              Statim can ask but never sign on its own.
            </Text>
          </Note>
          {hardwareVendors().map((wallet) => (
            <ListItem
              key={wallet.id}
              testID={`connect-${wallet.id}`}
              title={wallet.label}
              subtitle={CONNECTION[wallet.connection].how}
              numberOfLinesSubtitle={2}
              leading={<RowIcon name={CONNECTION[wallet.connection].icon} tone="grey" />}
              onPress={() => choose(wallet)}
            />
          ))}
        </>
      );
    }
    if (busy) return <Text variant="footnote">{busy}</Text>;
    if (chosen.connection === 'companion-app') return null;
    if (chosen.connection === 'qr') {
      const wallet = chosen;
      const read = async (data: string) => {
        reader.current ??= urReader();
        try {
          const result: UR | number = reader.current.read(data);
          if (typeof result === 'number') return undefined;
          const key = readAccountUr(result);
          void finish(wallet, wallet.open(key), key);
          return null;
        } catch (e) {
          reader.current = null;
          return errorMessage(e, 'That QR is not a Keystone account.');
        }
      };
      return (
        <>
          <Text variant="footnote">
            On your {wallet.label}, open Connect Software Wallet, choose MetaMask, and scan the QR
            code it shows.
          </Text>
          <QrReader
            purpose={`The camera reads the account QR from your ${wallet.label}, and nothing else.`}
            onScanned={read}
            className="h-72"
          />
        </>
      );
    }
    const wallet = chosen;
    return (
      <>
        <Text variant="footnote">{CONNECTION[wallet.connection].how}</Text>
        <DeviceList vendor={wallet} onPick={(deviceId) => void pick(wallet, deviceId)} />
      </>
    );
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        leave();
        onClose();
      }}
      title={chosen ? `Connect your ${chosen.label}` : 'Connect a hardware wallet'}>
      <View className="gap-3">
        {content()}
        <ErrorText>{error}</ErrorText>
        {chosen ? (
          <Button
            label="Back"
            tone="neutral"
            fullWidth
            disabled={busy !== null && chosen.connection !== 'companion-app'}
            onPress={leave}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

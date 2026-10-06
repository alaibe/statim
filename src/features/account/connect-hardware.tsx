import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Button, ErrorText, ListItem, Note, QrReader, RowIcon, Sheet, Text, toast } from '@/design';
import { errorMessage } from '@/core/errors';
import { Cancelled } from '@/core/account/device-prompt';
import {
  DEFAULT_EVM_PATH,
  hardwareVendors,
  type HardwareSigner,
  type HardwareVendor,
} from '@/core/account/hardware';
import { useAccountStore } from '@/core/account/account-store';
import { decodeUr, readAccountUr } from '@/core/account/vendors/keystone';

import { CONNECTION, DeviceList } from './device-prompt';

export function ConnectHardware({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const addHardwareAccount = useAccountStore((s) => s.addHardwareAccount);
  const [chosen, setChosen] = useState<HardwareVendor | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frames = useRef<string[]>([]);

  const reset = () => {
    frames.current = [];
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
      reset();
      onClose();
    } catch (e) {
      if (!(e instanceof Cancelled)) {
        setError(errorMessage(e, `Could not connect your ${wallet.label}`));
      }
      setBusy(null);
    }
  };

  const pickDevice = async (wallet: HardwareVendor, deviceId: string) => {
    setBusy(`Connecting to your ${wallet.label}…`);
    try {
      const signer = await wallet.connect!(deviceId);
      await finish(wallet, signer, { path: DEFAULT_EVM_PATH, device: deviceId });
    } catch (e) {
      setError(errorMessage(e, `Could not reach your ${wallet.label}`));
      setBusy(null);
    }
  };

  const readPairing = async (wallet: HardwareVendor, data: string) => {
    frames.current.push(data);
    const ur = decodeUr(frames.current);
    if (!ur) return undefined;
    try {
      const account = readAccountUr(ur);
      void finish(wallet, wallet.open!(account), { path: account.path, xfp: account.xfp });
      return null;
    } catch (e) {
      frames.current = [];
      return errorMessage(e, 'That QR is not a Keystone account.');
    }
  };

  const choose = (wallet: HardwareVendor) => {
    setError(null);
    setChosen(wallet);
    if (wallet.connection === 'companion-app') {
      void finish(wallet, wallet.open!({ address: '0x', path: DEFAULT_EVM_PATH }), {
        path: DEFAULT_EVM_PATH,
      });
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
      title={chosen ? `Connect your ${chosen.label}` : 'Connect a hardware wallet'}>
      <View className="gap-3">
        {chosen === null ? (
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
        ) : busy ? (
          <Text variant="footnote">{busy}</Text>
        ) : chosen.connection === 'qr' ? (
          <>
            <Text variant="footnote">
              On your {chosen.label}, open Connect Software Wallet, choose MetaMask, and scan the QR
              code it shows.
            </Text>
            <QrReader
              purpose={`The camera reads the account QR from your ${chosen.label}, and nothing else.`}
              onScanned={(data) => readPairing(chosen, data)}
              className="h-72"
            />
          </>
        ) : chosen.scan ? (
          <>
            <Text variant="footnote">{CONNECTION[chosen.connection].how}</Text>
            <DeviceList
              vendor={chosen}
              disabled={busy !== null}
              onPick={(id) => void pickDevice(chosen, id)}
            />
          </>
        ) : null}

        <ErrorText>{error}</ErrorText>

        {chosen ? (
          <Button
            label="Back"
            tone="neutral"
            fullWidth
            disabled={busy !== null && !chosen.cancel}
            onPress={() => {
              chosen.cancel?.();
              reset();
            }}
          />
        ) : null}
      </View>
    </Sheet>
  );
}

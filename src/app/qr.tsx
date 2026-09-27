import { useRouter } from 'expo-router';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button, Card, copyText, IconButton, Screen, Text } from '@/design';
import { useAccountStore } from '@/core/account/account-store';
import { shortAddress } from '@/core/account/keyring';

export default function QrScreen() {
  const router = useRouter();
  const keyring = useAccountStore((s) => s.keyring);
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);

  const label = accounts.find((a) => a.id === activeAccountId)?.label ?? 'Your account';

  if (!keyring) {
    return (
      <Screen className="items-center justify-center">
        <Text variant="footnote">No account is open.</Text>
      </Screen>
    );
  }

  return (
    <Screen className="justify-between px-gutter py-4" edges={['top', 'bottom']}>
      <View className="flex-row justify-end">
        <IconButton
          icon="close"
          label="Close"
          surface="sunken"
          size={18}
          onPress={() => router.back()}
        />
      </View>

      <View className="items-center gap-6">
        <Card className="items-center gap-4 p-6">
          <View className="rounded-card bg-white p-4">
            <QRCode value={keyring.address} size={220} backgroundColor="#ffffff" color="#000000" />
          </View>
          <View className="items-center gap-1">
            <Text className="font-semibold">{label}</Text>
            <Text variant="mono" selectable>
              {shortAddress(keyring.address, 12, 10)}
            </Text>
          </View>
        </Card>

        <Text variant="footnote" className="text-center">
          Anyone who scans this can start a chat with you. It is your public address, so sharing it
          reveals nothing that is not already public on-chain.
        </Text>
      </View>

      <View className="gap-2">
        {process.env.EXPO_OS === 'web' ? null : (
          <Button
            label="Share address"
            fullWidth
            onPress={() => {
              Share.share({ message: keyring.address }).catch(() => {});
            }}
          />
        )}
        <Button
          label="Copy address"
          tone="neutral"
          fullWidth
          onPress={() => copyText(keyring.address, 'Address copied')}
        />
      </View>
    </Screen>
  );
}

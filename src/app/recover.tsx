import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Icon, Screen, Text } from '@/design';
import { eraseEverything } from '@/core/app/erase-account';
import { useAccountStore } from '@/core/account/account-store';
import { shortAddress } from '@/core/account/keyring';
import { useAction } from '@/features/use-action';

export default function RecoverScreen() {
  const router = useRouter();

  const accounts = useAccountStore((s) => s.accounts);
  const erase = useAction(
    async () => {
      await eraseEverything();
      router.replace('/(onboarding)/welcome');
    },
    { failure: 'Could not erase this device' }
  );

  return (
    <Screen className="justify-center gap-6 px-gutter">
      <View className="items-center gap-3">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-surface-sunken">
          <Icon name="key-outline" size={34} tone="danger" />
        </View>
        <Text variant="headline" className="text-center">
          Your keys need re-importing
        </Text>
      </View>

      <Text variant="bodyMuted">
        This device&apos;s biometrics changed, so iOS discarded the keys that were sealed to them.
        That is the trade-off of protecting keys with Face ID, and it cannot be undone from here.
      </Text>

      <Card className="gap-2">
        <Text variant="caption">Affected</Text>
        {accounts.map((account) => (
          <Text key={account.id} variant="mono">
            {account.label} · {shortAddress(account.address, 8, 6)}
          </Text>
        ))}
      </Card>

      <Text variant="bodyMuted">
        Your messages and settings are still here. Import an account&apos;s recovery phrase and it
        picks up exactly where it left off.
      </Text>

      <View className="gap-2">
        <Button
          label="Import a recovery phrase"
          fullWidth
          onPress={() => router.push('/(onboarding)/import')}
        />
        <Button
          label="Erase everything and start over"
          tone="danger"
          fullWidth
          onPress={() => erase.run()}
        />
      </View>
    </Screen>
  );
}

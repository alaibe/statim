import { useState } from 'react';
import { View } from 'react-native';

import { Card, copyText, Icon, Note, Pressable, Text } from '@/design';
import { useAccountStore } from '@/core/account/account-store';
import { shortAddress } from '@/core/account/keyring';
import { RevealablePhrase } from '@/features/account/recovery-phrase';
import { SettingsScreen } from '@/features/settings/settings-screen';

export default function RecoveryPhraseScreen() {
  const keyring = useAccountStore((s) => s.keyring);

  const [revealed, setRevealed] = useState(false);

  return (
    <SettingsScreen title="Recovery phrase">
      <View className="gap-4 px-gutter">
        <Card className="gap-2">
          <Text variant="caption">Address</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy address"
            onPress={() => {
              if (keyring) void copyText(keyring.address, 'Address copied');
            }}
            pressScale={0.99}
            className="flex-row items-center justify-between">
            <Text variant="mono">{keyring ? shortAddress(keyring.address, 12, 10) : '—'}</Text>
            <Icon name="copy-outline" size={16} tone="muted" />
          </Pressable>
        </Card>

        <Note tone="danger">
          Anyone with these words controls your messages and any funds at this address. Never type
          them into a website or share them with support.
        </Note>

        <RevealablePhrase
          phrase={keyring?.mnemonic ?? ''}
          revealed={revealed}
          onReveal={() => setRevealed(true)}
        />

        <Text variant="caption">
          To remove this account from the device, use Erase this account in Settings.
        </Text>
      </View>
    </SettingsScreen>
  );
}

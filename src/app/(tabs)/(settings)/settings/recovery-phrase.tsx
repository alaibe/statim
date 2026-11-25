import { useState } from "react";
import { View } from "react-native";
import { useAccountStore } from "@/core/account/account-store";
import { shortAddress } from "@/core/account/keyring";
import { copyText, Icon, Notice, Section, SettingsRow, Text } from "@/design";
import { RevealablePhrase } from "@/features/account/recovery-phrase";
import { SettingsScreen } from "@/features/settings/settings-screen";

export default function RecoveryPhraseScreen() {
  const keyring = useAccountStore((s) => s.keyring);

  const [revealed, setRevealed] = useState(false);

  if (!keyring?.mnemonic) {
    return (
      <SettingsScreen title="Recovery phrase">
        <View className="px-4">
          <Text tone="muted">
            {keyring
              ? "This account’s key lives on its hardware wallet, so Statim has no recovery phrase for it."
              : "No account is open."}
          </Text>
        </View>
      </SettingsScreen>
    );
  }

  return (
    <SettingsScreen title="Recovery phrase">
      <View className="gap-6">
        <Section label="Address">
          <SettingsRow
            label={shortAddress(keyring.address, 12, 10)}
            accessibilityLabel="Copy address"
            control={<Icon name="copy" size={16} tone="muted" />}
            onPress={() => void copyText(keyring.address, "Copied the address")}
          />
        </Section>

        <View className="gap-4 px-4">
          <Notice
            tone="danger"
            tag="WARN"
            message="Anyone with these words controls your messages and any funds at this address."
            detail="Never type them into a website or share them with support."
          />

          <RevealablePhrase phrase={keyring.mnemonic} revealed={revealed} onReveal={() => setRevealed(true)} />

          <Text size="sm" tone="muted">
            To remove this account from the device, use Erase this account in Settings.
          </Text>
        </View>
      </View>
    </SettingsScreen>
  );
}

import { useRouter } from "expo-router";
import { View } from "react-native";
import { useAccountStore } from "@/core/account/account-store";
import { shortAddress } from "@/core/account/keyring";
import { eraseEverything } from "@/core/app/erase-account";
import { Button, Notice, Screen, Section, SettingsRow, Text } from "@/design";
import { useAction } from "@/features/use-action";

export default function RecoverScreen() {
  const router = useRouter();

  const accounts = useAccountStore((s) => s.accounts);
  const erase = useAction(
    async () => {
      await eraseEverything();
      router.replace("/(onboarding)/welcome");
    },
    { failure: "Could not erase this device" },
  );

  return (
    <Screen className="justify-center gap-6 px-4">
      <Text variant="title">Your keys need re-importing</Text>

      <Notice
        tone="warning"
        message="This device's biometrics changed, so iOS discarded the keys that were sealed to them."
        detail="That is the trade-off of protecting keys with Face ID, and it cannot be undone from here."
      />

      <View className="-mx-4">
        <Section label="Affected">
          {accounts.map((account) => (
            <SettingsRow key={account.id} label={account.label} value={shortAddress(account.address, 8, 6)} />
          ))}
        </Section>
      </View>

      <Text tone="muted">
        Your messages and settings are still here. Import an account&apos;s recovery phrase and it picks up exactly
        where it left off.
      </Text>

      <View className="gap-2">
        <Button
          variant="primary"
          label="Import a recovery phrase"
          fullWidth
          onPress={() => router.push("/(onboarding)/import")}
        />
        <Button label="Erase everything and start over" variant="danger" fullWidth onPress={() => erase.run()} />
      </View>
    </Screen>
  );
}

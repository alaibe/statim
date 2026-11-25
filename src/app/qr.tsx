import { useRouter } from "expo-router";
import { Share, View } from "react-native";
import { activeAccount, useAccountStore } from "@/core/account/account-store";
import { shortAddress } from "@/core/account/keyring";
import { Button, copyText, Notice, QrCode, Screen, Section, Text } from "@/design";
import { RouteHeader } from "@/features/navigation/route-header";

export default function QrScreen() {
  const router = useRouter();
  const keyring = useAccountStore((s) => s.keyring);
  const account = useAccountStore(activeAccount);

  if (!keyring || !account) {
    return (
      <Screen edges={["top", "bottom"]}>
        <RouteHeader title="Your QR code" onClose={() => router.back()} />
        <View className="p-4">
          <Notice tone="warning" message="No account is open." />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={["top", "bottom"]}>
      <RouteHeader title="Your QR code" onClose={() => router.back()} />
      <View className="flex-1 justify-between p-4">
        <View className="items-center gap-6">
          <Section raised>
            <View className="items-center gap-4">
              <QrCode value={keyring.address} />
              <View className="items-center gap-1">
                <Text strong>{account.label}</Text>
                <Text variant="code" selectable>
                  {shortAddress(keyring.address, 12, 10)}
                </Text>
              </View>
            </View>
          </Section>

          <Text tone="muted" align="center">
            Anyone who scans this can start a chat with you. It is your public address, so sharing it reveals nothing
            that is not already public on-chain.
          </Text>
        </View>

        <View className="gap-2">
          {process.env.EXPO_OS === "web" ? null : (
            <Button
              variant="primary"
              label="Share address…"
              fullWidth
              onPress={() => {
                Share.share({ message: keyring.address }).catch(() => {});
              }}
            />
          )}
          <Button
            icon="copy"
            label="Copy address"
            fullWidth
            onPress={() => copyText(keyring.address, "Copied the address")}
          />
        </View>
      </View>
    </Screen>
  );
}

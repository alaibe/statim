import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import Animated from "react-native-reanimated";
import { hardwareVendors } from "@/core/account/hardware";
import { BootLine, Button, Enter, LitPoint, Screen, stagger, Text } from "@/design";
import { ConnectHardware } from "@/features/account/connect-hardware";

export default function Welcome() {
  const router = useRouter();
  const [connecting, setConnecting] = useState(false);

  return (
    <Screen className="px-4">
      <View className="flex-1 justify-end gap-4 pb-6">
        <Animated.View entering={Enter.content(stagger(0, 70))} className="items-start gap-4">
          <LitPoint size={64} />
          <BootLine>statim</BootLine>
        </Animated.View>
        <Animated.View entering={Enter.content(stagger(1, 70))} className="gap-1">
          <Text variant="display">Talk freely.</Text>
          <Text variant="display">Own everything.</Text>
        </Animated.View>
        <Animated.View entering={Enter.content(stagger(2, 70))} className="mt-2">
          <Text tone="muted">
            End-to-end encrypted messaging with no company in the middle. Your account is a key you hold, and it also
            works as your Ethereum wallet.
          </Text>
        </Animated.View>
      </View>

      <Animated.View entering={Enter.content(stagger(3, 70))} className="gap-2 pb-8">
        <Button
          variant="primary"
          label="Create an account"
          fullWidth
          onPress={() => router.push("/(onboarding)/create")}
        />
        <Button
          label="I already have a recovery phrase"
          variant="ghost"
          fullWidth
          onPress={() => router.push("/(onboarding)/import")}
        />
        {hardwareVendors().length > 0 ? (
          <Button
            testID="onboarding-hardware"
            label="Connect a hardware wallet…"
            variant="ghost"
            fullWidth
            onPress={() => setConnecting(true)}
          />
        ) : null}
        {process.env.EXPO_OS === "web" ? null : (
          <View className="mt-1">
            <Text size="sm" tone="muted" align="center">
              No phone number or email, so nothing to leak.
            </Text>
          </View>
        )}
      </Animated.View>

      <ConnectHardware visible={connecting} onClose={() => setConnecting(false)} />
    </Screen>
  );
}

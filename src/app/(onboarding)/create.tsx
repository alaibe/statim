import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import Animated from "react-native-reanimated";
import { useAccountStore } from "@/core/account/account-store";
import { createMnemonic, keyringFromMnemonic, shortAddress } from "@/core/account/keyring";
import { errorMessage } from "@/core/errors";
import { Avatar, Button, copyText, Enter, IconButton, Input, Screen, stagger, Text, toast } from "@/design";
import { RevealablePhrase } from "@/features/account/recovery-phrase";
import { useBack } from "@/features/navigation/use-back";

export default function CreateAccount() {
  const goBack = useBack("/(onboarding)/welcome");
  const router = useRouter();
  const adoptAccount = useAccountStore((s) => s.adoptAccount);

  const [{ phrase, preview }] = useState(() => {
    const phrase = createMnemonic();
    return { phrase, preview: keyringFromMnemonic(phrase) };
  });

  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");

  async function confirm() {
    setSaving(true);
    try {
      await adoptAccount(phrase, label);
      router.replace("/chats");
    } catch (error) {
      toast.error(errorMessage(error, "Could not save your account"));
      setSaving(false);
    }
  }

  return (
    <Screen className="px-4">
      <View className="-ml-2 flex-row pt-1">
        <IconButton icon="chevron-left" label="Back" onPress={goBack} />
      </View>
      <ScrollView contentContainerClassName="gap-6 py-4" showsVerticalScrollIndicator={false}>
        <Animated.View entering={Enter.content()} className="items-center gap-3">
          <Avatar label={label || "Personal"} size={64} />
          <View className="items-center gap-1">
            <Text variant="title">Your new account</Text>
            <Text variant="meta">{shortAddress(preview.address, 10, 8)}</Text>
          </View>
        </Animated.View>

        <Animated.View entering={Enter.content(stagger(1, 70))}>
          <Input
            label="Name this account"
            placeholder="Personal"
            onChangeText={setLabel}
            maxLength={40}
            autoCapitalize="words"
            help="Just for you, on this device. An ENS name is the one other people see."
          />
        </Animated.View>

        <Animated.View entering={Enter.content(stagger(2, 70))}>
          <Text tone="muted">
            These twelve words <Text strong>are</Text> your account. Anyone who has them controls your messages and your
            funds. Write them down offline: there is no reset link.
          </Text>
        </Animated.View>

        <Animated.View entering={Enter.content(stagger(2, 70))}>
          <RevealablePhrase phrase={phrase} revealed={revealed} onReveal={() => setRevealed(true)}>
            <Button
              label="Copy phrase"
              icon="copy"
              size="sm"
              onPress={() => copyText(phrase, "Copied. Paste it somewhere safe, then clear your clipboard.")}
            />
          </RevealablePhrase>
        </Animated.View>
      </ScrollView>

      <View className="gap-2 pb-8 pt-2">
        <Button
          variant="primary"
          label="I've written it down"
          fullWidth
          disabled={!revealed}
          busy={saving}
          onPress={confirm}
        />
        <Text size="sm" tone="muted" align="center">
          {revealed ? "Continuing stores the phrase in this device’s keychain." : "Reveal the phrase to continue."}
        </Text>
      </View>
    </Screen>
  );
}

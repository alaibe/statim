import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, View } from "react-native";
import Animated from "react-native-reanimated";
import { useAccountStore } from "@/core/account/account-store";
import { isValidMnemonic, normalizeMnemonic } from "@/core/account/keyring";
import { errorMessage } from "@/core/errors";
import { Button, Enter, IconButton, Input, Screen, Text } from "@/design";
import { useBack } from "@/features/navigation/use-back";

export default function ImportAccount() {
  const router = useRouter();
  const goBack = useBack("/(onboarding)/welcome");
  const adoptAccount = useAccountStore((s) => s.adoptAccount);

  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const wordCount = phrase.trim() ? normalizeMnemonic(phrase).split(" ").length : 0;
  const looksComplete = wordCount === 12 || wordCount === 24;

  async function submit() {
    setError(null);

    if (!isValidMnemonic(phrase)) {
      setError("That phrase is not valid. Check for typos and that the words are in order.");
      return;
    }

    setBusy(true);
    try {
      await adoptAccount(phrase);
      router.replace("/chats");
    } catch (e) {
      setError(errorMessage(e, "Could not restore that account"));
      setBusy(false);
    }
  }

  return (
    <Screen className="px-4">
      <View className="-ml-2 flex-row pt-1">
        <IconButton icon="chevron-left" label="Back" onPress={goBack} />
      </View>
      <KeyboardAvoidingView behavior="padding" className="flex-1 justify-between">
        <Animated.View entering={Enter.content()} className="gap-6 pt-4">
          <View className="gap-2">
            <Text variant="title">Restore your account</Text>
            <Text tone="muted">Enter the 12 or 24 word recovery phrase. It never leaves this device.</Text>
          </View>

          <Input
            testID="import-phrase"
            label="Recovery phrase"
            mono
            placeholder="witch collapse practice feed shame open despair creek road again ice least"
            onChangeText={(t) => {
              setPhrase(t);
              if (error) setError(null);
            }}
            error={error}
            help={wordCount > 0 ? `${wordCount} words` : "Separate each word with a space"}
            multiline
            numberOfLines={4}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            spellCheck={false}
          />
        </Animated.View>

        <View className="gap-2 pb-8">
          <Button
            testID="import-submit"
            variant="primary"
            label="Restore account"
            fullWidth
            disabled={!looksComplete}
            busy={busy}
            onPress={submit}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

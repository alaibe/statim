import { Stack } from "expo-router";
import { KeyboardAvoidingView, ScrollView, View } from "react-native";

import { desktop, PageHeader, Screen, Text } from "@/design";

/** A settings page: the stack header names it on a phone, the page header on the desktop. */
export function SettingsScreen({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: desktop ? 0 : 16, paddingBottom: 48 }}
        >
          {desktop ? (
            <PageHeader title={title} intro={intro} />
          ) : intro ? (
            <View className="px-4 pb-6">
              <Text tone="muted">{intro}</Text>
            </View>
          ) : null}
          <View className={desktop ? "px-6" : undefined}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

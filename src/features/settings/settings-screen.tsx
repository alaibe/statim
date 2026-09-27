import { Stack } from 'expo-router';
import { KeyboardAvoidingView, ScrollView } from 'react-native';

import { Screen, Text } from '@/design';

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
    <Screen className="bg-surface px-0" edges={[]}>
      <Stack.Screen options={{ title }} />
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 48 }}>
          {intro ? (
            <Text variant="bodyMuted" className="px-gutter pb-4">
              {intro}
            </Text>
          ) : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

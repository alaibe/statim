import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ animation: "slide_from_right" }}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      {/* Each draws its own back control: from Settings › Accounts, a header back button would not appear. */}
      <Stack.Screen name="create" options={{ headerShown: false }} />
      <Stack.Screen name="import" options={{ headerShown: false }} />
    </Stack>
  );
}

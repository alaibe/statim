import { Stack } from "expo-router";

import { desktop, PageHeader, PhoneHeader, useThemeColors } from "@/design";

import { stackScreenOptions } from "./stack-options";

const PLACEHOLDERS = new Set(["chats", "contacts", "settings/index"]);

/** A tab's stack: the phone draws the system's header, the desktop the detail's page header. */
export function TabStack() {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        ...stackScreenOptions(colors),
        headerShown: true,
        header: ({ options, navigation, back, route }) => {
          const title = typeof options.title === "string" ? options.title : "";
          const action = options.headerRight?.({ canGoBack: Boolean(back), tintColor: colors.accent });
          if (desktop) {
            return PLACEHOLDERS.has(route.name) || !title ? null : <PageHeader title={title} actions={action} />;
          }
          return <PhoneHeader title={title} onBack={back ? navigation.goBack : undefined} action={action} />;
        },
      }}
    />
  );
}

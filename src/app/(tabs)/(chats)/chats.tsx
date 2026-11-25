import { Stack, useRouter } from "expo-router";
import { View } from "react-native";

import {
  controlHeight,
  Icon,
  IconButton,
  PhoneHeader,
  Pressable,
  Radius,
  Screen,
  Text,
  useThemeColors,
} from "@/design";
import { ChatList } from "@/features/chat/chat-list";
import { folderLabel, leaveFolderLabel } from "@/features/chat/chat-list-rows";
import { useChatListStore } from "@/features/chat/chat-list-store";
import { useOverlays } from "@/features/navigation/commands";
import { useConnectionSummary } from "@/features/navigation/connection";
import { Palette } from "@/features/navigation/palette";

export default function ChatsScreen() {
  const router = useRouter();
  const folder = useChatListStore((s) => s.folder);
  const setFolder = useChatListStore((s) => s.setFolder);
  const summary = useConnectionSummary();

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: false }} />
      <PhoneHeader
        title={folder ? folderLabel(folder) : "Chats"}
        subtitle={summary.label || undefined}
        onBack={folder ? () => setFolder(null) : undefined}
        backLabel={folder ? leaveFolderLabel(folder) : undefined}
        action={
          <IconButton
            testID="header-new-chat"
            icon="square-pen"
            label="New message"
            onPress={() => router.push("/new-chat")}
          />
        }
      />
      <View className="px-4 py-2">
        <PaletteButton />
      </View>
      <ChatList query="" />
      <Palette />
    </Screen>
  );
}

/** The phone opens the palette from a search button: chats, places and every action, by name. */
function PaletteButton() {
  const colors = useThemeColors();
  return (
    <Pressable
      testID="chats-search"
      accessibilityRole="search"
      accessibilityLabel="Search chats and commands"
      onPress={() => useOverlays.getState().set({ palette: true })}
      style={{
        height: controlHeight(),
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: 12,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: colors["line-strong"],
        backgroundColor: colors.panel,
      }}
    >
      <Icon name="search" size={16} tone="muted" />
      <Text tone="muted">Search chats and commands</Text>
    </Pressable>
  );
}

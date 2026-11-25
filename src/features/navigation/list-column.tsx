import { useGlobalSearchParams, useSegments } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { IconButton, SearchField, Space } from "@/design";
import { ChatList } from "@/features/chat/chat-list";
import { chatSearchPlaceholder, FolderHeader } from "@/features/chat/chat-list-rows";
import { useChatListStore } from "@/features/chat/chat-list-store";
import { ContactList, type ContactSort } from "@/features/contacts/contact-list";
import { SettingsAccount, useEnsName } from "@/features/settings/settings-account";
import { SettingsSections, settingsPageFor, useSettingsKeys } from "@/features/settings/settings-sections";

import type { PlaceId } from "./commands";

/** The desktop's list region: the items of the current place, as rows, under its search field. */
export function ListColumn({ place }: { place: PlaceId }) {
  const segments = useSegments() as string[];
  const params = useGlobalSearchParams<{ id?: string }>();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<ContactSort>("name");
  const [sorting, setSorting] = useState(false);
  const folder = useChatListStore((s) => s.folder);
  const setFolder = useChatListStore((s) => s.setFolder);

  const selectedId = segments[0] === "chat" ? params.id : undefined;
  const settingsPage = settingsPageFor(segments, params.id);
  const revision = place === "settings" ? (settingsPage ?? "settings") : null;
  const keys = useSettingsKeys(revision);
  const ensName = useEnsName(revision);

  if (place === "settings") {
    return (
      <ScrollView>
        <SettingsAccount ensName={ensName} />
        <SettingsSections keys={keys} selected={settingsPage} compact />
      </ScrollView>
    );
  }

  const contacts = place === "contacts";
  return (
    <View style={{ flex: 1 }}>
      {folder && !contacts ? (
        <View style={{ paddingHorizontal: Space[3], paddingTop: Space[3] }}>
          <FolderHeader folder={folder} onBack={() => setFolder(null)} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: Space[1], padding: Space[3] }}>
        <View style={{ flex: 1 }}>
          <SearchField
            placeholder={contacts ? "Search contacts" : chatSearchPlaceholder(folder)}
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery("")}
            shortcut="/"
          />
        </View>
        {contacts ? (
          <IconButton icon="arrow-left-right" label="Sort contacts" onPress={() => setSorting(true)} />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        {contacts ? (
          <ContactList
            query={query}
            sortBy={sortBy}
            sorting={sorting}
            onSort={setSortBy}
            onCloseSort={() => setSorting(false)}
            selectedChatId={selectedId}
          />
        ) : (
          <ChatList query={query} selectedId={selectedId} />
        )}
      </View>
    </View>
  );
}

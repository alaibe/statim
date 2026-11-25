import { Stack } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { IconButton, PhoneHeader, Screen, SearchField } from "@/design";
import { ContactList, type ContactSort } from "@/features/contacts/contact-list";

export default function ContactsScreen() {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<ContactSort>("name");
  const [sorting, setSorting] = useState(false);

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: false }} />
      <PhoneHeader
        title="Contacts"
        action={<IconButton icon="arrow-left-right" label="Sort contacts" onPress={() => setSorting(true)} />}
      />
      <View className="px-4 py-2">
        <SearchField placeholder="Search contacts" value={query} onChangeText={setQuery} onClear={() => setQuery("")} />
      </View>
      <ContactList
        query={query}
        sortBy={sortBy}
        sorting={sorting}
        onSort={setSortBy}
        onCloseSort={() => setSorting(false)}
      />
    </Screen>
  );
}

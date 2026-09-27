import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';

import { IconButton, Pressable, Screen, Text } from '@/design';
import { ContactList, type ContactSort } from '@/features/contacts/contact-list';

export default function ContactsScreen() {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<ContactSort>('name');
  const [sorting, setSorting] = useState(false);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Contacts',
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sort contacts"
              onPress={() => setSorting(true)}>
              <Text className="font-medium text-brand">Sort</Text>
            </Pressable>
          ),
          headerRight: () => (
            <IconButton
              icon="add"
              label="New chat"
              tone="brand"
              size={24}
              onPress={() => router.push('/new-chat')}
            />
          ),
        }}
      />
      <Stack.SearchBar
        placeholder="Search"
        hideWhenScrolling={false}
        onChangeText={(e) => setQuery(e.nativeEvent.text)}
      />

      <Screen className="px-0" edges={[]}>
        <ContactList
          query={query}
          sortBy={sortBy}
          sorting={sorting}
          onSort={setSortBy}
          onCloseSort={() => setSorting(false)}
        />
      </Screen>
    </>
  );
}

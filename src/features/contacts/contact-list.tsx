import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { type ChatState, selfIdFor, useChatStore } from "@/core/messaging/chat-store";
import { ActionSheet, Avatar, Button, Card, Icon, ListItem, Section, Text } from "@/design";
import { useDisplayNames } from "@/features/chat/use-display-names";
import { contactKey, contactNetwork, contactsOf, fromContactKey } from "@/features/contacts/contacts";
import { type ContactAccess, currentAccess, manageLimitedAccess } from "@/features/contacts/device-contacts";
import { openChat } from "@/features/navigation/open";

export type ContactSort = "name" | "recent";

interface ContactListProps {
  query: string;
  sortBy: ContactSort;
  sorting: boolean;
  onSort: (sortBy: ContactSort) => void;
  onCloseSort: () => void;
  selectedChatId?: string;
}

let lastKeys: {
  chats: ChatState["chats"];
  sessions: ChatState["sessions"];
  byName: boolean;
  keys: string[];
} | null = null;

function contactKeysOf(state: ChatState, byName: boolean): string[] {
  const { chats, sessions } = state;
  if (lastKeys?.chats === chats && lastKeys.sessions === sessions && lastKeys.byName === byName) {
    return lastKeys.keys;
  }
  const listed = contactsOf(chats, (protocol) => selfIdFor(state, protocol)).map(contactKey);
  lastKeys = { chats, sessions, byName, keys: byName ? listed.sort() : listed };
  return lastKeys.keys;
}

export function ContactList({ query, sortBy, sorting, onSort, onCloseSort, selectedChatId }: ContactListProps) {
  const router = useRouter();

  const keys = useChatStore(useShallow((s) => contactKeysOf(s, sortBy === "name")));

  const [access, setAccess] = useState<ContactAccess>("unknown");

  const refreshAccess = () => {
    currentAccess()
      .then(setAccess)
      .catch(() => setAccess("none"));
  };

  useEffect(refreshAccess, [refreshAccess]);

  const contacts = keys.map(fromContactKey);

  const { nameFor } = useDisplayNames(contacts);

  const ordered =
    sortBy === "name" ? [...contacts].sort((a, b) => nameFor(a.id).localeCompare(nameFor(b.id))) : contacts;
  const q = query.trim().toLowerCase();
  const visible = q ? ordered.filter((p) => nameFor(p.id).toLowerCase().includes(q)) : ordered;

  return (
    <>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        {access === "limited" && process.env.EXPO_OS === "ios" ? (
          <Card className="mx-4 mb-4 flex-row items-center gap-3">
            <View className="flex-1">
              <Text variant="footnote">You have shared only some of your contacts with Statim.</Text>
            </View>
            <Button
              label="Manage"
              size="sm"
              onPress={async () => {
                await manageLimitedAccess();
                refreshAccess();
              }}
            />
          </Card>
        ) : null}

        <Section surface="list">
          <ListItem
            testID="invite-contacts"
            title={<Text className="font-semibold text-accent">Invite contacts</Text>}
            leading={<Icon name="person-add-outline" size={22} tone="accent" />}
            onPress={() => router.push("/invite")}
          />
        </Section>

        <Section
          title="On Statim"
          surface="list"
          empty={
            query
              ? "Nobody matches that search."
              : "Nobody yet. Start a chat with an address or an ENS name and they will appear here."
          }
          className="mt-6"
        >
          {visible.map((contact) => (
            <ListItem
              key={`${contact.protocol}-${contact.id}`}
              title={nameFor(contact.id)}
              subtitle={contactNetwork(contact)}
              leading={<Avatar seed={nameFor(contact.id)} size="md" />}
              selected={contact.chatId === selectedChatId}
              onPress={() => openChat(contact.chatId)}
            />
          ))}
        </Section>
      </ScrollView>
      <ActionSheet
        visible={sorting}
        onClose={onCloseSort}
        title="Sort by"
        actions={[
          { label: "Name", selected: sortBy === "name", onPress: () => onSort("name") },
          {
            label: "Recently active",
            selected: sortBy === "recent",
            onPress: () => onSort("recent"),
          },
        ]}
      />
    </>
  );
}

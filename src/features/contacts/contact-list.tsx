import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { type ChatState, selfIdFor, useChatStore } from "@/core/messaging/chat-store";
import { Avatar, Icon, Menu, Notice, Row, RowGroup, Text } from "@/design";
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
          <View className="px-4 pb-2 pt-3">
            <Notice
              tone="info"
              message="You have shared only some of your contacts with Statim."
              action={{
                label: "Manage…",
                onPress: async () => {
                  await manageLimitedAccess();
                  refreshAccess();
                },
              }}
            />
          </View>
        ) : null}

        <Row
          testID="invite-contacts"
          title="Invite contacts…"
          leading={<Icon name="user-plus" size={20} tone="muted" />}
          onPress={() => router.push("/invite")}
        />

        <RowGroup label="On Statim">
          {visible.length === 0 ? (
            <View className="px-4 py-3">
              <Text size="sm" tone="muted">
                {query
                  ? "Nobody matches that search."
                  : "Nobody yet. Start a chat with an address or an ENS name and they will appear here."}
              </Text>
            </View>
          ) : null}
          {visible.map((contact) => (
            <Row
              key={`${contact.protocol}-${contact.id}`}
              title={nameFor(contact.id)}
              preview={contactNetwork(contact)}
              leading={<Avatar size={40} label={nameFor(contact.id)} />}
              selected={contact.chatId === selectedChatId}
              onPress={() => openChat(contact.chatId)}
            />
          ))}
        </RowGroup>
      </ScrollView>
      <Menu
        visible={sorting}
        onClose={onCloseSort}
        title="Sort by"
        items={[
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

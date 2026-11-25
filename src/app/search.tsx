import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { errorMessage } from "@/core/errors";
import { useChatStore } from "@/core/messaging/chat-store";
import { parseChatId } from "@/core/messaging/namespace";
import { contentPreview, formatTimestamp } from "@/core/messaging/preview";
import type { ChatMessage } from "@/core/messaging/types";
import { EmptyState, ErrorText, ListItem, ModalHeader, Screen, SearchField, Text } from "@/design";
import { useJumpStore } from "@/features/chat/jump-store";
import { useChatTitles } from "@/features/chat/use-display-names";
import { openChatFromSheet } from "@/features/navigation/open";

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ chatId?: string; q?: string }>();
  const chatId = parseChatId(params.chatId ?? "") ?? undefined;
  const searchMessages = useChatStore((s) => s.searchMessages);
  const chats = useChatStore((s) => s.chats);
  const jumpTo = useJumpStore((s) => s.jumpTo);
  const [query, setQuery] = useState(params.q ?? "");
  const [found, setFound] = useState<{ query: string; messages: ChatMessage[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  useEffect(() => {
    if (!trimmed) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchMessages(trimmed, chatId)
        .then((messages) => {
          if (!cancelled) setFound({ query: trimmed, messages });
        })
        .catch((reason) => {
          if (!cancelled) setError(errorMessage(reason, "Search failed"));
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatId, trimmed, searchMessages]);

  const { titleOf } = useChatTitles(chats);
  const titles = new Map(chats.map((c) => [c.id, titleOf(c)]));
  const results = trimmed && found?.query === trimmed ? found.messages : [];
  const searching = Boolean(trimmed) && found?.query !== trimmed && !error;

  return (
    <Screen className="px-0" edges={["top"]}>
      <ModalHeader
        title={chatId ? `Search ${titles.get(chatId) ?? "chat"}` : "Search messages"}
        onClose={router.back}
        className="px-4"
      />
      <View className="px-4 pb-3">
        <SearchField
          autoFocus
          placeholder="Search messages"
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setError(null);
          }}
          onClear={() => {
            setQuery("");
            setError(null);
          }}
        />
      </View>
      <ErrorText className="px-4">{error}</ErrorText>
      {searching ? <Text className="px-4 py-2">Searching…</Text> : null}
      <FlatList
        data={results}
        keyExtractor={(message) => `${message.chatId}:${message.id}`}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          trimmed && !searching && !error ? <EmptyState icon="search" title="No messages found" /> : null
        }
        renderItem={({ item }) => (
          <ListItem
            title={titles.get(item.chatId) ?? "Chat"}
            meta={formatTimestamp(item.sentAt)}
            subtitle={contentPreview(item.content)}
            numberOfLinesSubtitle={3}
            onPress={() => {
              jumpTo(item);
              openChatFromSheet(item.chatId);
            }}
          />
        )}
      />
    </Screen>
  );
}

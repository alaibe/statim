import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { errorMessage } from "@/core/errors";
import { useChatStore } from "@/core/messaging/chat-store";
import { parseChatId } from "@/core/messaging/namespace";
import { contentPreview } from "@/core/messaging/preview";
import type { ChatMessage } from "@/core/messaging/types";
import { EmptyState, Notice, Row, Screen, SearchField, Skeleton } from "@/design";
import { useJumpStore } from "@/features/chat/jump-store";
import { formatListTime } from "@/features/chat/list-time";
import { useChatTitles } from "@/features/chat/use-display-names";
import { openChatFromSheet } from "@/features/navigation/open";
import { RouteHeader } from "@/features/navigation/route-header";

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
  const [attempt, setAttempt] = useState(0);

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
          if (!cancelled) setError(errorMessage(reason, "Couldn’t search your messages"));
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [chatId, trimmed, searchMessages, attempt]);

  const { titleOf } = useChatTitles(chats);
  const titles = new Map(chats.map((c) => [c.id, titleOf(c)]));
  const results = trimmed && found?.query === trimmed ? found.messages : [];
  const searching = Boolean(trimmed) && found?.query !== trimmed && !error;

  return (
    <Screen edges={["top"]}>
      <RouteHeader
        title={chatId ? `Search ${titles.get(chatId) ?? "chat"}` : "Search messages"}
        onClose={router.back}
      />
      <View className="px-4 pb-3 pt-3">
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
      {error ? (
        <View className="px-4 pb-3">
          <Notice
            tone="danger"
            message={error}
            action={{
              label: "Retry",
              onPress: () => {
                setError(null);
                setAttempt((n) => n + 1);
              },
            }}
          />
        </View>
      ) : null}
      {searching ? <Skeleton rows={3} /> : null}
      <FlatList
        data={results}
        keyExtractor={(message) => `${message.chatId}:${message.id}`}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          trimmed && !searching && !error ? (
            <EmptyState noMatch boot="no match" text={`No message says “${trimmed}”. Try fewer words.`} />
          ) : null
        }
        renderItem={({ item }) => (
          <Row
            title={titles.get(item.chatId) ?? "Chat"}
            meta={formatListTime(item.sentAt)}
            preview={contentPreview(item.content)}
            previewLines={3}
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

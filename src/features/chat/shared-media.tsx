import { useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { isLocalChat } from "@/core/messaging/bots";
import { useChatStore } from "@/core/messaging/chat-store";
import { countsFor, entriesOf, type MediaCategory, type MediaEntry } from "@/core/messaging/media-index";
import { formatDayLabel } from "@/core/messaging/preview";
import type { ChatId } from "@/core/messaging/types";
import { Icon, type IconName, Image, ListItem, Pressable, Text } from "@/design";
import { openUrlQuietly } from "./link-actions";

const TABS: { id: MediaCategory; label: string }[] = [
  { id: "media", label: "Media" },
  { id: "files", label: "Files" },
  { id: "voice", label: "Voice" },
  { id: "links", label: "Links" },
  { id: "gifs", label: "GIFs" },
];

export function SharedMedia({ chatId }: { chatId: ChatId }) {
  const [tab, setTab] = useState<MediaCategory>("media");
  const { width } = useWindowDimensions();
  const mediaIndex = useChatStore((s) => s.mediaIndex);
  const counts = countsFor(mediaIndex, chatId);
  const entries = entriesOf(mediaIndex, chatId, tab);
  const cell = Math.floor((Math.min(width, 720) - 4 * 2) / 3) - 2;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 pb-3">
        {TABS.map((entry) => {
          const active = entry.id === tab;
          return (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityLabel={`${entry.label}, ${counts[entry.id]}`}
              onPress={() => setTab(entry.id)}
              className={
                active
                  ? "flex-row items-center gap-1.5 rounded-full bg-accent px-3 py-1.5"
                  : "flex-row items-center gap-1.5 rounded-full bg-side px-3 py-1.5"
              }
            >
              <Text variant="caption" className={active ? "font-semibold text-on-accent" : "font-medium text-fg"}>
                {entry.label}
              </Text>
              <Text variant="micro" className={active ? "text-on-accent/80" : "text-subtle"}>
                {counts[entry.id]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {entries.length === 0 ? (
        <Text variant="footnote" className="px-4 py-6">
          {isLocalChat(chatId) ? "Bot chats do not share files." : `Nothing shared in this chat yet.`}
        </Text>
      ) : tab === "media" || tab === "gifs" ? (
        <View className="flex-row flex-wrap gap-0.5 px-1">
          {entries.map((entry) => (
            <Image
              key={`${entry.messageId}-${entry.uri}`}
              source={{ uri: entry.uri }}
              style={{ width: cell, height: cell }}
              contentFit="cover"
            />
          ))}
        </View>
      ) : (
        entries.map((entry) => <MediaRow key={`${entry.messageId}-${entry.uri}`} entry={entry} category={tab} />)
      )}
    </>
  );
}

function MediaRow({ entry, category }: { entry: MediaEntry; category: MediaCategory }) {
  const icon: IconName =
    category === "voice" ? "mic-outline" : category === "links" ? "link-outline" : "document-outline";

  return (
    <ListItem
      title={entry.label ?? entry.uri}
      subtitle={formatDayLabel(entry.sentAt)}
      leading={<Icon name={icon} size={20} tone="muted" />}
      onPress={() => openUrlQuietly(entry.uri)}
    />
  );
}

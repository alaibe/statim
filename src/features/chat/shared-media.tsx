import { useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { isLocalChat } from "@/core/messaging/bots";
import { useChatStore } from "@/core/messaging/chat-store";
import { countsFor, entriesOf, type MediaCategory, type MediaEntry } from "@/core/messaging/media-index";
import { formatDayLabel } from "@/core/messaging/preview";
import type { ChatId } from "@/core/messaging/types";
import { Icon, type IconName, Image, Row, Tabs, Text } from "@/design";
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
      <View className="mb-2">
        <Tabs<MediaCategory>
          items={TABS.map((entry) => ({ ...entry, count: counts[entry.id] }))}
          value={tab}
          onChange={setTab}
        />
      </View>

      {entries.length === 0 ? (
        <Text tone="muted" className="px-4 py-6">
          {isLocalChat(chatId) ? "Bot chats don't share files." : "Nothing shared in this chat yet."}
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
  const icon: IconName = category === "voice" ? "mic" : category === "links" ? "link" : "file";

  return (
    <Row
      title={entry.label ?? entry.uri}
      meta={formatDayLabel(entry.sentAt)}
      leading={<Icon name={icon} size={16} tone="muted" />}
      onPress={() => openUrlQuietly(entry.uri)}
    />
  );
}

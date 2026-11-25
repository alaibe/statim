import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useAccountStore } from "@/core/account/account-store";
import { errorMessage } from "@/core/errors";
import type { ChatId, MessageContent } from "@/core/messaging/types";
import { Divider, FieldError, Image, Pressable, Radius, SearchField, Segmented, Skeleton, Text } from "@/design";
import { useKeyedLoad } from "@/lib/use-keyed-load";

import { featuredGifs, type Gif, gifToContent, loadGifKey, searchGifs } from "./attachments/gifs";
import { EmojiGrid } from "./emoji-grid";
import { StickerGrid } from "./sticker-grid";
import { useChatPermissions } from "./use-chat-permissions";

export type MediaTab = "emoji" | "stickers" | "gifs";

const TAB_LABELS: Record<MediaTab, string> = { emoji: "Emoji", stickers: "Stickers", gifs: "GIFs" };

export interface MediaAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MediaPanelProps {
  chatId: ChatId;
  tabs: MediaTab[];
  tab: MediaTab;
  anchor?: MediaAnchor | null;
  onClose(): void;
  onEmoji(emoji: string): void;
  onSend(content: MessageContent): void;
}

type MediaPanelContentProps = Omit<MediaPanelProps, "anchor" | "onClose"> & {
  onTab(tab: MediaTab): void;
  /** A popover has the keyboard already; a bottom sheet would raise it over itself. */
  autoFocusSearch?: boolean;
};

const GIF_COLUMNS = 3;
const GIF_GAP = 4;
const SEARCH_DEBOUNCE_MS = 350;

export function MediaPanelContent({
  chatId,
  tabs,
  tab,
  onTab,
  onEmoji,
  onSend,
  autoFocusSearch,
}: MediaPanelContentProps) {
  const [width, setWidth] = useState(0);

  return (
    <View className="flex-1" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View className="flex-1">
        {width === 0 ? null : tab === "emoji" ? (
          <EmojiGrid width={width} onEmoji={onEmoji} autoFocusSearch={autoFocusSearch} />
        ) : tab === "stickers" ? (
          <StickerGrid chatId={chatId} width={width} onSend={onSend} />
        ) : (
          <GifGrid chatId={chatId} width={width} onSend={onSend} autoFocusSearch={autoFocusSearch} />
        )}
      </View>

      <Divider />
      {tabs.length > 1 ? (
        <View className="items-center px-3 py-2">
          <Segmented
            accessibilityLabel="Media"
            options={tabs.map((entry) => ({ value: entry, label: TAB_LABELS[entry] }))}
            value={tab}
            onChange={onTab}
          />
        </View>
      ) : null}
    </View>
  );
}

function GifGrid({
  chatId,
  width,
  onSend,
  autoFocusSearch,
}: {
  chatId: ChatId;
  width: number;
  onSend(content: MessageContent): void;
  autoFocusSearch?: boolean;
}) {
  const accountId = useAccountStore((s) => s.activeAccountId);
  const { largeFiles } = useChatPermissions(chatId);

  const gifKey = useKeyedLoad(accountId, loadGifKey);
  const key = gifKey.loading ? undefined : (gifKey.value ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Gif[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const trimmed = query.trim();
    const load = async () => {
      setBusy(true);
      setError(null);
      try {
        const found = trimmed ? await searchGifs(key, trimmed) : await featuredGifs(key);
        if (!cancelled) setResults(found);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e, "Could not load GIFs"));
      }
      if (!cancelled) setBusy(false);
    };
    const timer = setTimeout(() => void load(), trimmed ? SEARCH_DEBOUNCE_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, query]);

  if (key === null) {
    return (
      <View className="gap-3 px-4 py-4">
        <Text tone="muted">
          GIF search needs a KLIPY key, which you add in Settings. There is no keyless GIF API, and this app does not
          ship credentials of its own.
        </Text>
        <Text tone="muted">
          You can still send GIFs without one: pick them from your photo library like any other image and they send
          animated.
        </Text>
      </View>
    );
  }

  const tile = Math.floor((width - 24 - GIF_GAP * (GIF_COLUMNS - 1)) / GIF_COLUMNS);

  const send = async (gif: Gif) => {
    if (!accountId) return;
    try {
      onSend(await gifToContent(accountId, gif, largeFiles));
    } catch (e) {
      setError(errorMessage(e, "Could not send that GIF"));
    }
  };

  return (
    <View className="flex-1">
      <View className="mx-3 mb-2 mt-3">
        <SearchField placeholder="Search GIFs" autoFocus={autoFocusSearch} value={query} onChangeText={setQuery} />
      </View>

      {error ? (
        <View className="px-4 pb-2">
          <FieldError>{error}</FieldError>
        </View>
      ) : null}

      {busy && results.length === 0 ? (
        <Skeleton rows={3} lines={1} />
      ) : (
        <ScrollView
          contentContainerClassName="flex-row flex-wrap px-3 pb-3"
          contentContainerStyle={{ gap: GIF_GAP }}
          keyboardShouldPersistTaps="handled"
        >
          {results.map((gif) => (
            <Pressable
              key={gif.id}
              accessibilityRole="button"
              accessibilityLabel={gif.description}
              onPress={() => void send(gif)}
            >
              <Image
                source={{ uri: gif.previewUrl }}
                style={{ width: tile, height: tile, borderRadius: Radius.md }}
                contentFit="cover"
              />
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Text variant="meta" align="right" className="px-4 pb-2">
        GIFs by KLIPY
      </Text>
    </View>
  );
}

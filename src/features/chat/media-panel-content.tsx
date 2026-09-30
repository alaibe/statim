import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { ErrorText, Loading, Pressable, SearchField, Text } from '@/design';
import { useAccountStore } from '@/core/account/account-store';
import type { ChatId, MessageContent } from '@/core/messaging/types';
import { errorMessage } from '@/core/errors';
import { useKeyedLoad } from '@/lib/use-keyed-load';

import { featuredGifs, gifToContent, loadGifKey, searchGifs, type Gif } from './attachments/gifs';
import { EmojiGrid } from './emoji-grid';
import { StickerGrid } from './sticker-grid';

export type MediaTab = 'emoji' | 'stickers' | 'gifs';

const TAB_LABELS: Record<MediaTab, string> = { emoji: 'Emoji', stickers: 'Stickers', gifs: 'GIFs' };

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
  /** Where the button that opened it sits; the desktop docks the panel to it. */
  anchor?: MediaAnchor | null;
  onClose(): void;
  onEmoji(emoji: string): void;
  onSend(content: MessageContent): void;
}

export type MediaPanelContentProps = Omit<MediaPanelProps, 'anchor' | 'onClose'> & {
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
        {width === 0 ? null : tab === 'emoji' ? (
          <EmojiGrid width={width} onEmoji={onEmoji} autoFocusSearch={autoFocusSearch} />
        ) : tab === 'stickers' ? (
          <StickerGrid chatId={chatId} width={width} onSend={onSend} />
        ) : (
          <GifGrid width={width} onSend={onSend} autoFocusSearch={autoFocusSearch} />
        )}
      </View>

      <View className="flex-row items-center justify-center gap-1 border-t border-line px-3 py-2">
        {tabs.map((entry) => {
          const active = entry === tab;
          return (
            <Pressable
              key={entry}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onTab(entry)}
              className={
                active ? 'rounded-pill bg-surface-sunken px-4 py-1.5' : 'rounded-pill px-4 py-1.5'
              }>
              <Text
                className={
                  active ? 'font-semibold text-content' : 'font-medium text-content-muted'
                }>
                {TAB_LABELS[entry]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function GifGrid({
  width,
  onSend,
  autoFocusSearch,
}: {
  width: number;
  onSend(content: MessageContent): void;
  autoFocusSearch?: boolean;
}) {
  const accountId = useAccountStore((s) => s.activeAccountId);

  const gifKey = useKeyedLoad(accountId, loadGifKey);
  const key = gifKey.loading ? undefined : (gifKey.value ?? null);
  const [query, setQuery] = useState('');
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
        if (!cancelled) setError(errorMessage(e, 'Could not load GIFs'));
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
        <Text variant="footnote">
          GIF search needs a KLIPY key, which you add in Settings. There is no keyless GIF API, and
          this app does not ship credentials of its own.
        </Text>
        <Text variant="footnote">
          You can still send GIFs without one: pick them from your photo library like any other
          image and they send animated.
        </Text>
      </View>
    );
  }

  const tile = Math.floor((width - 24 - GIF_GAP * (GIF_COLUMNS - 1)) / GIF_COLUMNS);

  const send = async (gif: Gif) => {
    if (!accountId) return;
    try {
      onSend(await gifToContent(accountId, gif));
    } catch (e) {
      setError(errorMessage(e, 'Could not send that GIF'));
    }
  };

  return (
    <View className="flex-1">
      <SearchField
        className="mx-3 mb-2 mt-3"
        placeholder="Search GIFs"
        autoFocus={autoFocusSearch}
        value={query}
        onChangeText={setQuery}
      />

      <ErrorText className="px-4 pb-2">{error}</ErrorText>

      {busy && results.length === 0 ? (
        <Loading className="flex-1 py-8" />
      ) : (
        <ScrollView
          contentContainerClassName="flex-row flex-wrap px-3 pb-3"
          contentContainerStyle={{ gap: GIF_GAP }}
          keyboardShouldPersistTaps="handled">
          {results.map((gif) => (
            <Pressable
              key={gif.id}
              accessibilityRole="button"
              accessibilityLabel={gif.description}
              onPress={() => void send(gif)}>
              <Image
                source={{ uri: gif.previewUrl }}
                style={{ width: tile, height: tile, borderRadius: 8 }}
                contentFit="cover"
              />
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Text variant="micro" className="px-4 pb-2 text-right">
        GIFs by KLIPY
      </Text>
    </View>
  );
}

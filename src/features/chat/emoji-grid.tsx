import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  Text as NativeText,
  View,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Icon, SearchField, Text, type IconName } from '@/design';

import {
  CATEGORIES,
  CELL,
  type EmojiRow,
  emojiRows,
  HEADER,
  RECENT,
  searchEmoji,
} from './emoji-data';
import { useRecentEmoji } from './use-recent-emoji';

const PAD = 8;
const EMOJI_SIZE = 26;

interface EmojiGridProps {
  width: number;
  onEmoji(emoji: string): void;
  autoFocusSearch?: boolean;
}

export function EmojiGrid({ width, onEmoji, autoFocusSearch }: EmojiGridProps) {
  const list = useRef<FlatList<EmojiRow>>(null);

  const [query, setQuery] = useState('');
  const [recent, remember] = useRecentEmoji();
  const [active, setActive] = useState<string>(CATEGORIES[0].id);

  const columns = Math.max(4, Math.floor((width - PAD * 2) / CELL));
  const cell = (width - PAD * 2) / columns;

  const trimmed = query.trim();

  const { rows, offsets, sections } = useMemo(
    () => emojiRows(trimmed, recent, columns),
    [trimmed, recent, columns]
  );

  const pick = useCallback(
    (emoji: string) => {
      onEmoji(emoji);
      remember(emoji);
    },
    [onEmoji, remember]
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y + 1;
      let current = sections[0]?.category ?? CATEGORIES[0].id;
      for (const section of sections) {
        if (section.offset <= y) current = section.category;
        else break;
      }
      setActive((previous) => (previous === current ? previous : current));
    },
    [sections]
  );

  const jumpTo = (category: string) => {
    const section = sections.find((s) => s.category === category);
    if (!section) return;
    setActive(category);
    list.current?.scrollToOffset({ offset: section.offset, animated: true });
  };

  const renderItem = ({ item }: ListRenderItemInfo<EmojiRow>) => {
    if (item.kind === 'header') {
      return (
        <View style={{ height: HEADER, paddingHorizontal: PAD + 4 }} className="justify-end pb-1">
          <Text variant="caption" className="font-semibold text-content-muted">
            {item.title}
          </Text>
        </View>
      );
    }
    return (
      <View style={{ height: CELL, paddingHorizontal: PAD }} className="flex-row">
        {item.emojis.map((emoji, index) => (
          <Pressable
            key={`${emoji}-${index}`}
            accessibilityRole="button"
            accessibilityLabel={emoji}
            onPress={() => pick(emoji)}
            style={{ width: cell, height: CELL }}
            className="items-center justify-center rounded-md hover:bg-surface-sunken active:bg-surface-sunken">
            <NativeText
              allowFontScaling={false}
              style={{ fontSize: EMOJI_SIZE, lineHeight: CELL - 4 }}>
              {emoji}
            </NativeText>
          </Pressable>
        ))}
      </View>
    );
  };

  const tabs =
    recent.length > 0 && !trimmed
      ? [{ id: RECENT, title: 'Recently used', icon: 'time-outline' as IconName }, ...CATEGORIES]
      : CATEGORIES;

  return (
    <View className="flex-1">
      <SearchField
        className="mx-3 mb-2 mt-3"
        placeholder="Search emoji"
        autoFocus={autoFocusSearch}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => {
          const first = trimmed ? searchEmoji(trimmed, 1)[0] : undefined;
          if (first) pick(first);
        }}
      />

      {rows.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text variant="footnote" className="text-center">
            No emoji match “{trimmed}”.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={list}
          data={rows}
          renderItem={renderItem}
          keyExtractor={(_, index) => String(index)}
          getItemLayout={(_, index) => ({
            length: rows[index].kind === 'header' ? HEADER : CELL,
            offset: offsets[index],
            index,
          })}
          onScroll={onScroll}
          scrollEventThrottle={32}
          initialNumToRender={14}
          windowSize={7}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: PAD }}
        />
      )}

      <View className="flex-row items-center border-t border-line px-2 py-1">
        {tabs.map((category) => {
          const selected = !trimmed && category.id === active;
          return (
            <Pressable
              key={category.id}
              accessibilityRole="tab"
              accessibilityLabel={category.title}
              accessibilityState={{ selected }}
              onPress={() => jumpTo(category.id)}
              className={
                selected
                  ? 'h-8 flex-1 items-center justify-center rounded-md bg-brand-soft'
                  : 'h-8 flex-1 items-center justify-center rounded-md hover:bg-surface-sunken'
              }>
              <Icon name={category.icon} size={20} tone={selected ? 'brand' : 'muted'} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

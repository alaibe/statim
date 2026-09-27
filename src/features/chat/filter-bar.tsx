import { ScrollView, View } from 'react-native';

import { cn, CountBadge, Pressable, Text } from '@/design';
import type { ChatFilter } from '@/core/messaging/folders';

const FILTERS: { id: ChatFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'dms', label: 'DMs' },
  { id: 'groups', label: 'Groups' },
];

export function FilterBar({
  active,
  onSelect,
  unread,
  mentions,
}: {
  active: ChatFilter;
  onSelect: (filter: ChatFilter) => void;
  unread: number;
  mentions: number;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="grow-0 border-b border-line"
      contentContainerClassName="px-1.5">
      {FILTERS.map(({ id, label }) => {
        const selected = id === active;
        const count = id === 'unread' ? unread : id === 'mentions' ? mentions : 0;
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={count ? `${label}, ${count} unread` : label}
            onPress={() => onSelect(id)}
            className="items-center px-2 pt-2">
            <View className="flex-row items-center gap-1 pb-2">
              <Text
                variant="footnote"
                className={cn('font-semibold', selected ? 'text-brand' : 'text-content-muted')}>
                {label}
              </Text>
              {count > 0 ? <CountBadge count={count} muted={!selected} /> : null}
            </View>
            <View
              className={cn(
                'h-0.5 self-stretch rounded-full',
                selected ? 'bg-brand' : 'bg-transparent'
              )}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

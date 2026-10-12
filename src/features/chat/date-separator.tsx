import { View } from 'react-native';

import { Text } from '@/design';
import { formatDayLabel } from '@/core/messaging/preview';

export function DateSeparator({ at }: { at: number }) {
  return (
    <View className="items-center py-2">
      <View className="rounded-pill bg-surface-sunken/90 px-2.5 py-1">
        <Text variant="micro" className="font-medium text-content-muted">
          {formatDayLabel(at)}
        </Text>
      </View>
    </View>
  );
}

export function SectionDivider({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-3 px-gutter py-2">
      <View className="h-px flex-1 bg-line" />
      <Text variant="micro" className="font-medium text-content-muted">
        {label}
      </Text>
      <View className="h-px flex-1 bg-line" />
    </View>
  );
}

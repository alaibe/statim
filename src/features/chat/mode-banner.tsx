import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Enter, Exit, IconButton, Text } from '@/design';

import type { ComposerBanner } from './composer-mode';

/** What the composer is replying to or editing, above the input. */
export function ModeBanner({
  banner,
  editing,
  onCancel,
}: {
  banner: ComposerBanner;
  editing: boolean;
  onCancel: () => void;
}) {
  return (
    <Animated.View
      entering={Enter.fade()}
      exiting={Exit.fade()}
      className="flex-row items-center gap-2 border-t border-line bg-surface-sunken px-gutter py-2">
      <View className="h-8 w-0.5 rounded-full bg-brand" />
      <View className="min-w-0 flex-1">
        <Text variant={banner.detail ? 'micro' : 'caption'} className="font-semibold text-brand">
          {banner.label}
        </Text>
        {banner.detail ? (
          <Text variant="caption" numberOfLines={1}>
            {banner.detail}
          </Text>
        ) : null}
      </View>
      <IconButton
        icon="close"
        label={editing ? 'Cancel edit' : 'Cancel reply'}
        tone="subtle"
        size={18}
        onPress={onCancel}
      />
    </Animated.View>
  );
}

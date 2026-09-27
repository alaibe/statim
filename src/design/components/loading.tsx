import { ActivityIndicator, View } from 'react-native';

import { cn } from '../lib/cn';

export function Loading({ className }: { className?: string }) {
  return (
    <View className={cn('items-center justify-center py-10', className)}>
      <ActivityIndicator />
    </View>
  );
}

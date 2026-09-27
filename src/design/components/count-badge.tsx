import { View } from 'react-native';

import { cn } from '../lib/cn';
import { Text } from './text';

export function CountBadge({ count, muted = false }: { count?: number; muted?: boolean }) {
  return (
    <View
      className={cn(
        'h-[18px] min-w-[18px] items-center justify-center rounded-pill px-1.5',
        muted ? 'bg-content-subtle' : 'bg-brand'
      )}>
      {count ? (
        <Text variant="micro" className="font-bold text-brand-on">
          {count > 999 ? '999+' : count}
        </Text>
      ) : null}
    </View>
  );
}

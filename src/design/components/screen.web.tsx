import { View } from 'react-native';

import { cn } from '../lib/cn';
import type { ScreenProps } from './screen';

export type { ScreenProps } from './screen';

/**
 * On desktop a screen sits in a pane or dialog that has its own background, so this only centres
 * the content column. `edges` is for a phone's notch and home indicator.
 */
export function Screen({ className, children, edges: _edges, ...props }: ScreenProps) {
  return (
    <View className="flex-1">
      <View className={cn('mx-auto w-full max-w-[720px] flex-1', className)} {...props}>
        {children}
      </View>
    </View>
  );
}

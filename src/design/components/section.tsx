import { Children } from 'react';
import { View, type ViewProps } from 'react-native';

import { Eyebrow } from './eyebrow';
import { Text } from './text';
import { cn } from '../lib/cn';

export interface SectionProps extends ViewProps {
  title?: string;
  surface?: 'plain' | 'list' | 'card';
  /** False when the card already sits inside padding, as in a sheet. */
  inset?: boolean;
  /** Shown in place of the rows when there are none. */
  empty?: string;
  className?: string;
}

export function Section({
  title,
  surface = 'plain',
  inset = true,
  empty,
  className,
  children,
  ...props
}: SectionProps) {
  const card = surface === 'card';

  return (
    <View className={className} {...props}>
      {title ? (
        <Eyebrow className={cn('mb-1.5', card ? inset && 'px-7' : 'px-gutter')}>{title}</Eyebrow>
      ) : null}
      <View
        style={card ? { borderCurve: 'continuous' } : undefined}
        className={cn(
          surface === 'list' && 'border-y border-line bg-surface-raised',
          card && 'overflow-hidden rounded-card bg-surface-raised',
          card && inset && 'mx-gutter'
        )}>
        {empty && Children.toArray(children).length === 0 ? (
          <Text variant="footnote" className="px-gutter py-6">
            {empty}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

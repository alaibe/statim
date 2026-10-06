import { View, type ViewProps } from 'react-native';

import { cn } from '../lib/cn';

interface CardProps extends ViewProps {
  className?: string;
}

export function Card({ className, ...props }: CardProps) {
  return (
    <View
      className={cn('rounded-card border border-line bg-surface-raised p-gutter', className)}
      style={{ borderCurve: 'continuous' }}
      {...props}
    />
  );
}

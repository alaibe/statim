import { View } from 'react-native';

import { cn } from '../lib/cn';
import { Icon, type IconName } from '../icon';
import { Text } from './text';

const TONE = {
  brand: { box: 'border-brand/15 bg-brand-soft', title: 'text-brand' },
  warning: { box: 'border-warning/40 bg-warning/10', title: 'text-warning' },
  danger: { box: 'border-danger/40 bg-danger/10', title: 'text-danger' },
} as const;

export interface NoteProps {
  title?: string;
  icon?: IconName;
  tone?: keyof typeof TONE;
  children: React.ReactNode;
  className?: string;
}

export function Note({ title, icon, tone = 'brand', children, className }: NoteProps) {
  return (
    <View
      style={{ borderCurve: 'continuous' }}
      className={cn('rounded-card border p-4', TONE[tone].box, className)}>
      {title ? (
        <View className="gap-2">
          <View className="flex-row items-center gap-2">
            {icon ? <Icon name={icon} size={16} tone={tone} /> : null}
            <Text variant="caption" className={cn('font-semibold', TONE[tone].title)}>
              {title}
            </Text>
          </View>
          {children}
        </View>
      ) : icon ? (
        <View className="flex-row items-start gap-2.5">
          <View className="pt-0.5">
            <Icon name={icon} size={16} tone={tone} />
          </View>
          <View className="min-w-0 flex-1 gap-2">{children}</View>
        </View>
      ) : (
        <View className="gap-2">{children}</View>
      )}
    </View>
  );
}

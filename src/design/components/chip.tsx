import { cn } from '../lib/cn';
import { Pressable } from './pressable';
import { Text } from './text';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  size?: 'sm' | 'md';
  testID?: string;
}

export function Chip({ label, selected, onPress, size = 'md', testID }: ChipProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ borderCurve: 'continuous' }}
      className={cn(
        'rounded-pill border px-3 py-1.5',
        selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface'
      )}>
      <Text
        variant={size === 'sm' ? 'caption' : 'footnote'}
        className={selected ? 'font-medium text-brand' : 'text-content'}>
        {label}
      </Text>
    </Pressable>
  );
}

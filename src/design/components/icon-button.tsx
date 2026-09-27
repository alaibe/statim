import { Pressable, type PressScaleProps } from './pressable';
import { Icon, type IconName } from '../icon';
import { cn } from '../lib/cn';

export interface IconButtonProps extends Omit<PressScaleProps, 'children'> {
  icon: IconName;
  label: string;
  tone?: 'brand' | 'muted';
  size?: number;
}

export function IconButton({
  icon,
  label,
  tone = 'muted',
  size = 22,
  className,
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn('size-tap items-center justify-center rounded-pill', className)}
      {...props}>
      <Icon name={icon} size={size} tone={tone} />
    </Pressable>
  );
}

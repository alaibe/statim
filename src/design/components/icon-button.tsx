import { Pressable, type PressScaleProps } from './pressable';
import { Icon, type IconName, type IconTone } from '../icon';
import { cn } from '../lib/cn';

const SURFACE = {
  plain: '',
  sunken: 'bg-surface-sunken',
  outline: 'border border-line bg-surface-raised',
  brand: 'bg-brand',
} as const;

export interface IconButtonProps extends Omit<PressScaleProps, 'children'> {
  icon: IconName;
  label: string;
  tone?: IconTone;
  surface?: keyof typeof SURFACE;
  size?: number;
}

export function IconButton({
  icon,
  label,
  surface = 'plain',
  tone = surface === 'brand' ? 'brand-on' : 'muted',
  size = 22,
  className,
  ...props
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      className={cn(
        'size-tap items-center justify-center rounded-pill',
        SURFACE[surface],
        className
      )}
      {...props}>
      <Icon name={icon} size={size} tone={tone} />
    </Pressable>
  );
}

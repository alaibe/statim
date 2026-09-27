import { cn } from '../lib/cn';
import { Text } from './text';

export function ErrorText({
  children,
  className,
}: {
  children?: string | null;
  className?: string;
}) {
  if (!children) return null;
  return (
    <Text variant="caption" className={cn('text-danger', className)}>
      {children}
    </Text>
  );
}

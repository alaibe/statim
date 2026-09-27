import { Icon } from '@/design';
import type { ChatMessage } from '@/core/messaging/types';

/** `color` tints a message that is sent and not yet read; failed and read have their own. */
export function DeliveryIcon({
  message,
  size,
  color,
}: {
  message: Pick<ChatMessage, 'status' | 'readAt'>;
  size: number;
  color?: string;
}) {
  const failed = message.status === 'failed';
  return (
    <Icon
      name={
        failed ? 'alert-circle' : message.status === 'sending' ? 'time-outline' : 'checkmark-done'
      }
      size={size}
      tone={failed ? 'danger' : message.readAt ? 'brand' : 'subtle'}
      color={failed || message.readAt ? undefined : color}
    />
  );
}
